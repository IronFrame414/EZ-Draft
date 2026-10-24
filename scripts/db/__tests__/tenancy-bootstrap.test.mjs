// EZD-005b T15b, T17 (a)-(e), T18 (vault/plans/EZD-005b.md section 4): the one-time cloud setup file
// supabase/bootstrap/tenant-1.sql, the docs, and no personal data. node:test, Node 22 built-ins only.
// T17 runs the file against the local container through scripts/db/sql.mjs runLocalSql, always inside
// a rolled-back transaction (or, for (d), a run the file itself refuses), so seeded rows never change.
// Expected values: plan Step 1 table and Step 2; Q-0033 (a); Q-0106; Q-0029 (a); EZD-023b line 274.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const bootstrapPath = path.join(repo, 'supabase', 'bootstrap', 'tenant-1.sql');
const seedPath = path.join(repo, 'supabase', 'seed.sql');
const migrationsDir = path.join(repo, 'supabase', 'migrations');
const runbookPath = path.join(repo, 'docs', 'runbook.md');
const archPath = path.join(repo, 'docs', 'architecture.md');
const sqlModule = path.join(repo, 'scripts', 'db', 'sql.mjs');

// Plan section 3 / Step 1 (EZD-005.md Step 1.2).
const TENANT_1_ID = '00000000-0000-4000-8000-000000000001';
const JOSH_USER_ID = '00000000-0000-4000-8000-000000001001';
const PLACEHOLDER = 'PASTE-YOUR-EMAIL-HERE';
const MARK = 'EZD_JSON:';

const readText = (p) => readFileSync(p, 'utf8');
const bootstrap = () => {
  assert.ok(existsSync(bootstrapPath), 'supabase/bootstrap/tenant-1.sql exists');
  return readText(bootstrapPath);
};

async function runLocalSql(sqlText) {
  const mod = await import(pathToFileURL(sqlModule).href);
  assert.equal(typeof mod.runLocalSql, 'function', 'scripts/db/sql.mjs exports runLocalSql');
  const r = await mod.runLocalSql(sqlText);
  assert.equal(typeof r.code, 'number', 'runLocalSql resolves { code }');
  return r;
}

// One JSON line (prefixed so it is found among any other psql output) with the tenant row, the
// app_user row and every membership of that user in that tenant (plan section 4 Common setup).
function jsonSelect(tenantId, userId, extra = '') {
  return `select '${MARK}' || json_build_object(
    'tenant', (select row_to_json(t) from public.tenant t where t.id = '${tenantId}'),
    'user', (select row_to_json(u) from public.app_user u where u.id = '${userId}'),
    'memberships', (select coalesce(json_agg(m), '[]'::json) from public.membership m
                    where m.tenant_id = '${tenantId}' and m.user_id = '${userId}')${extra}
  )::text;`;
}

function parseJson(out) {
  const line = out.split(/\r?\n/).find((l) => l.startsWith(MARK));
  assert.ok(line, `stdout has the ${MARK} line:\n${out}`);
  return JSON.parse(line.slice(MARK.length));
}

const withEmail = (text, email) => {
  assert.equal(text.split(PLACEHOLDER).length - 1, 1, 'placeholder exactly once');
  return text.replace(PLACEHOLDER, email);
};

const TRUNCATE = 'truncate public.tenant, public.app_user cascade;';

// ---------- T15b ----------

test('EZD-005b T15b Docs: runbook Tenant 1 section and architecture Tenancy tables', () => {
  const runbook = readText(runbookPath);
  const h2 = '## Tenant 1 setup (EZD-005)';
  const prior = '## Supabase cloud projects (EZD-004)';
  const start = runbook.indexOf(`\n${h2}`);
  assert.ok(start >= 0, `runbook has heading ${h2}`);
  assert.ok(runbook.indexOf(`\n${prior}`) >= 0, `runbook has heading ${prior}`);
  assert.ok(runbook.indexOf(`\n${prior}`) < start, 'Tenant 1 section sits after Supabase cloud projects');
  const rest = runbook.slice(start + 1 + h2.length);
  const nextH2 = rest.search(/\n## /);
  const section = nextH2 >= 0 ? rest.slice(0, nextH2) : rest;
  for (const needle of [
    'supabase/bootstrap/tenant-1.sql',
    PLACEHOLDER,
    'SQL Editor',
    'TENANT1_OWNER_EMAIL',
    'owner_email_secret_unused',
  ]) {
    assert.ok(section.includes(needle), `runbook Tenant 1 section contains ${needle}`);
  }

  const arch = readText(archPath);
  const h3 = '### Tenancy tables (EZD-005)';
  const aStart = arch.indexOf(`\n${h3}`);
  assert.ok(aStart >= 0, `architecture has heading ${h3}`);
  const aRest = arch.slice(aStart + 1 + h3.length);
  const aNext = aRest.search(/\n##/);
  const aSection = aNext >= 0 ? aRest.slice(0, aNext) : aRest;
  for (const needle of [TENANT_1_ID, JOSH_USER_ID, 'supabase/bootstrap/tenant-1.sql']) {
    assert.ok(aSection.includes(needle), `architecture Tenancy tables section contains ${needle}`);
  }
});

// ---------- T17 ----------

test('EZD-005b done when: the cloud setup file creates the same rows with the typed email', async () => {
  const sql = [
    'begin;',
    TRUNCATE,
    withEmail(bootstrap(), ' Owner.Test@Example.com '),
    jsonSelect(TENANT_1_ID, JOSH_USER_ID),
    'rollback;',
  ].join('\n');
  const r = await runLocalSql(sql);
  assert.equal(r.code, 0, `bootstrap runs clean:\n${r.stderr}`);
  assert.ok((r.stdout + r.stderr).includes('ezd_bootstrap_done'), 'notice ezd_bootstrap_done');
  const j = parseJson(r.stdout);
  assert.ok(j.tenant, 'tenant 1 row exists');
  assert.equal(j.tenant.name, 'Worth Properties');
  assert.deepEqual(j.tenant.contact, {});
  assert.ok(j.user, 'owner row exists');
  assert.equal(j.user.id, JOSH_USER_ID);
  assert.equal(j.user.email, 'owner.test@example.com');
  assert.equal(j.user.name, 'Josh Bishop');
  assert.equal(j.user.language, 'en');
  assert.equal(j.user.role_preset, 'owner');
  assert.equal(j.user.auth_user_id, null);
  assert.equal(j.memberships.length, 1, 'exactly one membership');
  assert.equal(j.memberships[0].status, 'active');
  assert.equal(j.memberships[0].scope, 'all');
  assert.equal(j.memberships[0].invited_at, null);
});

test('EZD-005b done when: the cloud setup file refuses a missing email or a second run without changing anything', async (t) => {
  await t.test('EZD-005b T17 (b) placeholder left in place is refused', async () => {
    const sql = ['begin;', TRUNCATE, bootstrap(), 'rollback;'].join('\n');
    const r = await runLocalSql(sql);
    assert.notEqual(r.code, 0, 'psql exits non-zero');
    assert.ok(r.stderr.includes('ezd_bootstrap_email_missing'), `stderr has the code:\n${r.stderr}`);
  });

  await t.test('EZD-005b T17 (c) text that is not an email is refused', async () => {
    const sql = ['begin;', TRUNCATE, withEmail(bootstrap(), 'not-an-email'), 'rollback;'].join('\n');
    const r = await runLocalSql(sql);
    assert.notEqual(r.code, 0, 'psql exits non-zero');
    assert.ok(r.stderr.includes('ezd_bootstrap_email_missing'), `stderr has the code:\n${r.stderr}`);
  });

  await t.test('EZD-005b T17 (d) second run is refused and the seeded rows stay', async () => {
    const first = await runLocalSql(withEmail(bootstrap(), 'second.run@example.com'));
    assert.notEqual(first.code, 0, 'psql exits non-zero');
    assert.ok(
      first.stderr.includes('ezd_bootstrap_already_done'),
      `stderr has the code:\n${first.stderr}`,
    );
    const second = await runLocalSql(
      jsonSelect(
        TENANT_1_ID,
        JOSH_USER_ID,
        `, 'second_run_count', (select count(*) from public.app_user where email = 'second.run@example.com')`,
      ),
    );
    assert.equal(second.code, 0, `select runs:\n${second.stderr}`);
    const j = parseJson(second.stdout);
    assert.equal(j.tenant.name, 'Worth Properties');
    assert.equal(j.user.email, 'josh@example.com');
    assert.equal(j.memberships.length, 1, 'exactly one membership of Josh in tenant 1');
    assert.equal(Number(j.second_run_count), 0, 'no row for the refused email');
  });

  await t.test('EZD-005b T17 (e) a refusal on empty tables leaves them empty', async () => {
    const F = bootstrap();
    assert.ok(!F.includes('$t$') && !F.includes('$f$'), 'dollar tags do not occur in the file');
    for (const variant of [F, withEmail(F, 'not-an-email')]) {
      const sql = [
        'begin;',
        TRUNCATE,
        `do $t$ begin execute $f$${variant}$f$; exception when others then raise notice 'caught:%', sqlerrm; end $t$;`,
        `select '${MARK}' || json_build_object(
          'tenant', (select count(*) from public.tenant),
          'app_user', (select count(*) from public.app_user),
          'membership', (select count(*) from public.membership)
        )::text;`,
        'rollback;',
      ].join('\n');
      const r = await runLocalSql(sql);
      assert.equal(r.code, 0, `wrapped run exits 0:\n${r.stderr}`);
      assert.ok(r.stderr.includes('caught:ezd_bootstrap_email_missing'), `caught:\n${r.stderr}`);
      const counts = parseJson(r.stdout);
      assert.equal(Number(counts.tenant), 0);
      assert.equal(Number(counts.app_user), 0);
      assert.equal(Number(counts.membership), 0);
    }
    // Afterwards the seeded rows (T1 values) are unchanged.
    const after = await runLocalSql(jsonSelect(TENANT_1_ID, JOSH_USER_ID));
    assert.equal(after.code, 0, after.stderr);
    const j = parseJson(after.stdout);
    assert.equal(j.tenant.name, 'Worth Properties');
    assert.equal(j.user.name, 'Josh Bishop');
    assert.equal(j.user.email, 'josh@example.com');
    assert.equal(j.user.language, 'en');
    assert.equal(j.user.role_preset, 'owner');
    assert.equal(j.user.ipad_input_mode, null);
    assert.equal(j.user.auth_user_id, null);
    assert.equal(j.memberships.length, 1);
    assert.equal(j.memberships[0].status, 'active');
    assert.equal(j.memberships[0].scope, 'all');
    assert.equal(j.memberships[0].invited_at, null);
  });
});

// ---------- T18 ----------

test('EZD-005b T18 No personal data; bootstrap and seed in step', () => {
  const F = bootstrap();
  const seed = readText(seedPath);
  assert.equal(F.split(PLACEHOLDER).length - 1, 1, 'placeholder exactly once');
  assert.ok(
    !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(F),
    'no email address in the bootstrap file',
  );
  for (const needle of [TENANT_1_ID, JOSH_USER_ID, 'Worth Properties', 'Josh Bishop']) {
    assert.ok(F.includes(needle), `bootstrap contains ${needle}`);
    assert.ok(seed.includes(needle), `seed contains ${needle}`);
  }
  assert.ok(!bootstrapPath.startsWith(migrationsDir + path.sep), 'bootstrap is not a migration');
  for (const f of readdirSync(migrationsDir)) {
    assert.ok(
      !readText(path.join(migrationsDir, f)).includes(PLACEHOLDER),
      `migration ${f} does not hold the bootstrap block`,
    );
  }
  for (const code of ['ezd_bootstrap_email_missing', 'ezd_bootstrap_already_done', 'ezd_bootstrap_done']) {
    assert.ok(F.includes(code), `bootstrap contains ${code}`);
  }
});

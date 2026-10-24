// EZD-005a T13, T14, T15a (vault/plans/EZD-005a.md section 4): migration text checks, generated types
// and docs. node:test, Node 22 built-ins only. T15a spawns gen-types.mjs --check, which needs the local
// stack the root `test` script starts with `pnpm run db:up`. Expected values: plan Data, Step 2, Step 5,
// section 3 (index names, file names); 11 rule 10; docs/architecture.md Migrations; Q-0036.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const migrationsDir = path.join(repo, 'supabase', 'migrations');
const typesFile = path.join(repo, 'app', 'src', 'server', 'db', 'database.types.ts');
const archFile = path.join(repo, 'docs', 'architecture.md');

const TABLES = ['tenant', 'app_user', 'project', 'membership', 'membership_project'];
const HEALTH_TS = '20261019153713'; // EZD-004a's health migration; every EZD-005a file comes after it
const FILE_ORDER = [
  'create_set_updated_at',
  'create_tenant',
  'create_app_user',
  'create_project',
  'create_membership',
  'create_membership_project',
];

// Pattern of scripts/ci/__tests__/ci.test.mjs childEnv: a spawned child never inherits the outer test scope.
function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.EZD_TEST_GREP;
  delete env.EZD_PHASE;
  delete env.NODE_TEST_CONTEXT;
  return env;
}

function runNode(script, args) {
  const r = spawnSync(process.execPath, [script, ...args], {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: childEnv(),
  });
  return { status: r.status, out: r.stdout || '', err: r.stderr || '' };
}

// Every migration file, lower-cased, SQL comments removed, whitespace collapsed (plan T13 "case-insensitive,
// whitespace collapsed").
function migrationTexts() {
  assert.ok(existsSync(migrationsDir), `${migrationsDir} exists`);
  const files = readdirSync(migrationsDir)
    .filter((f) => /^\d{14}_[a-z0-9_]+\.sql$/.test(f))
    .sort();
  return files.map((file) => {
    const raw = readFileSync(path.join(migrationsDir, file), 'utf8');
    const text = raw
      .replace(/--[^\n]*/g, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    return { file, text };
  });
}

const tableRe = (name) => `(?:public\\.|"public"\\.)?"?${name}"?(?![a-z0-9_])`;
const createTableRe = (name) =>
  new RegExp(`create table (?:if not exists )?${tableRe(name)}`, 'g');

// Splits a parenthesised body on top-level commas.
function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

// Body between the first `(` after `create table <name>` and its matching `)`.
function createTableBody(text, name) {
  const m = createTableRe(name).exec(text);
  if (!m) return null;
  const start = text.indexOf('(', m.index + m[0].length);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '(') depth++;
    if (text[i] === ')') {
      depth--;
      if (depth === 0) return text.slice(start + 1, i);
    }
  }
  return null;
}

const cols = (s) => s.split(',').map((c) => c.trim().replace(/^"|"$/g, '').split(' ')[0]);

// All key definitions of one table, from every migration file: { kind: 'index'|'unique'|'primary key',
// name?, columns[] } (plan T13 input).
function keysOf(texts, name) {
  const keys = [];
  for (const { text } of texts) {
    const body = createTableBody(text, name);
    if (body) {
      for (const item of splitTopLevel(body)) {
        let m = /^(?:constraint "?[a-z0-9_]+"? )?(primary key|unique) \(([^)]*)\)/.exec(item);
        if (m) {
          keys.push({ kind: m[1], columns: cols(m[2]) });
          continue;
        }
        if (/^(constraint|foreign key|check|primary key|unique)\b/.test(item)) continue;
        m = /^"?([a-z0-9_]+)"? .*\b(primary key|unique)\b/.exec(item);
        if (m) keys.push({ kind: m[2], columns: [m[1]] });
      }
    }
    const alterRe = new RegExp(
      `alter table (?:only )?${tableRe(name)} add (?:constraint "?[a-z0-9_]+"? )?(primary key|unique) \\(([^)]*)\\)`,
      'g',
    );
    for (const m of text.matchAll(alterRe)) keys.push({ kind: m[1], columns: cols(m[2]) });
    const indexRe = new RegExp(
      `create (unique )?index (?:concurrently )?(?:if not exists )?"?([a-z0-9_]+)"? on (?:only )?${tableRe(name)} (?:using [a-z]+ )?\\(([^)]*)\\)`,
      'g',
    );
    for (const m of text.matchAll(indexRe)) {
      keys.push({ kind: m[1] ? 'unique' : 'index', name: m[2], columns: cols(m[3]) });
    }
  }
  return keys;
}

const firstCols = (keys) => keys.map((k) => k.columns[0]);
const uniqueOn = (keys, col) =>
  keys.some((k) => (k.kind === 'unique' || k.kind === 'primary key') && k.columns.join(',') === col);

// ---------- T13 ----------

test('EZD-005a T13 Indexes', () => {
  const texts = migrationTexts();

  const project = keysOf(texts, 'project');
  assert.ok(firstCols(project).includes('tenant_id'), `project has a key leading with tenant_id: ${JSON.stringify(project)}`);
  assert.ok(project.some((k) => k.name === 'project_tenant_id_idx'), 'index project_tenant_id_idx exists');

  const membership = keysOf(texts, 'membership');
  assert.ok(firstCols(membership).includes('tenant_id'), `membership has a key leading with tenant_id: ${JSON.stringify(membership)}`);
  assert.ok(firstCols(membership).includes('user_id'), `membership has a key leading with user_id: ${JSON.stringify(membership)}`);
  assert.ok(membership.some((k) => k.name === 'membership_user_id_idx'), 'index membership_user_id_idx exists');

  const mp = keysOf(texts, 'membership_project');
  assert.ok(firstCols(mp).includes('tenant_id'), `membership_project has a key leading with tenant_id: ${JSON.stringify(mp)}`);
  assert.ok(firstCols(mp).includes('project_id'), `membership_project has a key leading with project_id: ${JSON.stringify(mp)}`);
  assert.ok(mp.some((k) => k.name === 'membership_project_tenant_id_idx'), 'index membership_project_tenant_id_idx exists');
  assert.ok(mp.some((k) => k.name === 'membership_project_project_id_idx'), 'index membership_project_project_id_idx exists');

  const appUser = keysOf(texts, 'app_user');
  assert.ok(uniqueOn(appUser, 'email'), `app_user unique on email: ${JSON.stringify(appUser)}`);
  assert.ok(uniqueOn(appUser, 'auth_user_id'), `app_user unique on auth_user_id: ${JSON.stringify(appUser)}`);
});

// ---------- T14 ----------

test('EZD-005a T14 RLS; one table per file', () => {
  const texts = migrationTexts();
  const anyCreate = /create table (?:if not exists )?(?:public\.|"public"\.)?"?([a-z0-9_]+)"?/g;

  for (const name of TABLES) {
    const creators = texts.filter(({ text }) => createTableRe(name).test(text));
    assert.equal(creators.length, 1, `exactly one file creates ${name}: ${creators.map((c) => c.file).join(', ')}`);
    const rls = new RegExp(`alter table (?:only )?${tableRe(name)} enable row level security`);
    assert.ok(rls.test(creators[0].text), `${creators[0].file} enables row level security on ${name}`);
  }

  for (const { file, text } of texts) {
    const created = [...text.matchAll(anyCreate)].map((m) => m[1]);
    assert.ok(created.length <= 1, `${file} creates at most one table: ${created.join(', ')}`);
    assert.ok(!/create table (?:if not exists )?(?:public\.)?user(?![a-z0-9_])/.test(text), `${file} does not create public.user`);
    assert.ok(!/create table (?:if not exists )?(?:public\.|"public"\.)?"user"/.test(text), `${file} does not create "user"`);
  }

  // Interface contract (plan section 3 "file"): six files, all after the health migration, ascending in order.
  const ours = FILE_ORDER.map((slug) => {
    const matches = texts.filter(({ file }) => file.slice(15) === `${slug}.sql`);
    assert.equal(matches.length, 1, `one migration file named <ts>_${slug}.sql`);
    return matches[0].file.slice(0, 14);
  });
  let prev = HEALTH_TS;
  for (const [i, ts] of ours.entries()) {
    assert.ok(ts > prev, `${FILE_ORDER[i]} (${ts}) comes after ${prev}`);
    prev = ts;
  }
});

// ---------- T15a ----------

// Text of the section that starts at the heading matching `headingRegex` and ends at the next heading
// of the same or a higher level (pattern of scripts/db/__tests__/db.test.mjs sectionOf).
function sectionOf(text, headingRegex) {
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex((l) => headingRegex.test(l));
  if (i < 0) return null;
  const level = lines[i].match(/^#+/)[0].length;
  const out = [];
  for (let j = i + 1; j < lines.length; j++) {
    const m = lines[j].match(/^(#+)\s/);
    if (m && m[1].length <= level) break;
    out.push(lines[j]);
  }
  return out.join('\n');
}

test('EZD-005a done when: committed database types match the local database', () => {
  const types = readFileSync(typesFile, 'utf8');
  // The generated file lists each table as `<name>: {` (quoted or bare) under `Tables: {`.
  const tablesStart = types.indexOf('Tables: {');
  assert.ok(tablesStart >= 0, 'database.types.ts has a Tables block');
  const tablesBlock = types.slice(tablesStart);
  for (const name of TABLES) {
    // The CLI writes most keys as `},"<name>": {` on the previous closing-brace line, so the key may
    // follow a line start, brace, comma or whitespace; the quote/colon after the name keeps it whole.
    const key = new RegExp(`(?:^|[{},\\s])"?${name}"?\\s*:\\s*\\{`, 'm');
    assert.ok(key.test(tablesBlock), `database.types.ts Tables has key ${name}`);
  }

  const gen = runNode(path.join(repo, 'scripts', 'db', 'gen-types.mjs'), ['--check']);
  assert.equal(gen.status, 0, `gen-types.mjs --check exits 0:\n${gen.out}\n${gen.err}`);

  const arch = readFileSync(archFile, 'utf8');
  const lines = arch.split(/\r?\n/);
  const mig = lines.findIndex((l) => /^## Migrations\s*$/.test(l));
  assert.ok(mig >= 0, '## Migrations exists');
  let next = lines.findIndex((l, i) => i > mig && /^## /.test(l));
  if (next < 0) next = lines.length;
  const headingIdx = lines.findIndex(
    (l, i) => i > mig && i < next && /^### Tenancy tables \(EZD-005\)\s*$/.test(l),
  );
  assert.ok(headingIdx > mig, '### Tenancy tables (EZD-005) sits between ## Migrations and the next ##');
  const section = sectionOf(arch, /^### Tenancy tables \(EZD-005\)\s*$/);
  for (const s of ['app_user', 'tenant', 'membership_project', 'contact.email', 'Q-0036']) {
    assert.ok(section.includes(s), `Tenancy tables names ${s}`);
  }

  const check = runNode(path.join(repo, 'scripts', 'conventions', 'check.mjs'), ['.']);
  assert.equal(check.status, 0, `check.mjs . exits 0:\n${check.out}\n${check.err}`);
});

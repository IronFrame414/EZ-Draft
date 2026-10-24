// EZD-009 T20 (vault/plans/EZD-009.md Tests; Steps 1-3, 5, 6, 9): static checks of the job queue's files.
// node:test, no database for the file checks; the kind-check half is in app/src/server/jobs/queue.db.test.ts.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (...p) => readFileSync(path.join(root, ...p), 'utf8');
const lower = (text) => text.toLowerCase();

function migration(suffix) {
  const dir = path.join(root, 'supabase', 'migrations');
  const files = readdirSync(dir).filter((f) => /^\d{14}_/.test(f) && f.endsWith(`_${suffix}.sql`));
  assert.equal(files.length, 1, `exactly one migration ending _${suffix}.sql`);
  return lower(readFileSync(path.join(dir, files[0]), 'utf8'));
}

// The text of one `create [or replace] function <name>(` statement, up to the next create statement.
function functionText(sql, name) {
  const start = sql.search(new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+${name}\\s*\\(`));
  assert.ok(start >= 0, `${name} is created`);
  const rest = sql.slice(start + 10);
  const next = rest.search(/\bcreate\s+(or\s+replace\s+)?(function|trigger|table)\b/);
  return next < 0 ? sql.slice(start) : sql.slice(start, start + 10 + next);
}

function section(text, heading) {
  const lines = text.split('\n');
  const level = heading.match(/^#+/)[0].length;
  const i = lines.findIndex((l) => l.trim() === heading);
  assert.ok(i >= 0, `${heading} exists`);
  let end = lines.findIndex(
    (l, k) => k > i && /^#{1,6} /.test(l) && l.match(/^#+/)[0].length <= level,
  );
  if (end < 0) end = lines.length;
  return lines.slice(i + 1, end).join('\n');
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

test('EZD-009 T20 vercel.json has the once-a-minute cron and keeps the EZD-003 keys', () => {
  const config = JSON.parse(read('app', 'vercel.json'));
  assert.deepEqual(config.crons, [{ path: '/api/jobs/sweep', schedule: '* * * * *' }]);
  assert.equal(config.framework, 'nextjs');
  assert.deepEqual(config.regions, ['iad1']);
  assert.equal('env' in config, false);
});

test('EZD-009 T20 .env.example names CRON_SECRET', () => {
  const names = read('.env.example')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'))
    .map((l) => l.split('=')[0]);
  assert.ok(names.includes('CRON_SECRET'));
});

test('EZD-009 T20 migrations: definer rules, skip locked, broadcast exception block', () => {
  const functions = migration('create_job_functions');
  for (const fn of [
    'job_claim',
    'job_fail_expired',
    'job_progress',
    'job_complete',
    'job_continue',
    'job_fail',
  ]) {
    assert.doesNotMatch(functionText(functions, `public\\.${fn}`), /security\s+definer/, fn);
  }
  const enqueue = functionText(functions, 'public\\.enqueue_job');
  assert.match(enqueue, /security\s+definer/);
  assert.match(enqueue, /set\s+search_path\s*=\s*''/);
  assert.match(functions, /for\s+update\s+skip\s+locked/);

  const trigger = migration('create_job_broadcast_trigger');
  const broadcast = functionText(trigger, 'private\\.job_broadcast');
  assert.match(broadcast, /security\s+definer/);
  assert.match(broadcast, /set\s+search_path\s*=\s*''/);
  assert.match(trigger, /exception\s+when\s+others/);

  const table = migration('create_job');
  assert.ok(table.includes('grant select on public.job to authenticated'));
  assert.ok(table.includes('grant select, insert, update, delete on public.job to service_role'));
});

test('EZD-009 T20 docs: architecture section, env row, machine checks rows, runbook section', () => {
  const architecture = read('docs', 'architecture.md');
  const lines = architecture.split('\n');
  const head = lines.findIndex((l) => l.trim() === '### Background jobs (EZD-009)');
  assert.ok(head >= 0, '### Background jobs (EZD-009) exists');
  const parent = [...lines.slice(0, head)].reverse().find((l) => l.startsWith('## '));
  assert.equal(parent, '## Runtime');
  const body = section(architecture, '### Background jobs (EZD-009)');
  for (const word of [
    'job_claim',
    'lease_expires_at',
    'run_id',
    'job.progress',
    'CRON_SECRET',
    '/api/jobs/sweep',
    'after(',
  ]) {
    assert.ok(body.includes(word), `section names ${word}`);
  }
  assert.ok(
    lines.some((l) => l.startsWith('| `CRON_SECRET`')),
    'CRON_SECRET env row',
  );
  const checks = section(architecture, '## Machine checks')
    .split('\n')
    .filter((l) => l.startsWith('|') && l.includes('EZD-009'));
  assert.ok(checks.length >= 2, 'two Machine checks rows name EZD-009');
  assert.ok(
    section(read('docs', 'runbook.md'), '## Background jobs (EZD-009)').includes('CRON_SECRET'),
  );
});

test('EZD-009 T20 the secret key is named in app/src only by app/src/server/jobs/db.ts', () => {
  const src = path.join(root, 'app', 'src');
  const holders = walk(src)
    .filter((f) => /\.(ts|tsx|mjs|js)$/.test(f) && !/\.(test|spec)\.[tj]sx?$/.test(f))
    .filter((f) => readFileSync(f, 'utf8').includes('SUPABASE_SECRET_KEY'))
    .map((f) => path.relative(root, f).split(path.sep).join('/'));
  assert.deepEqual(holders, ['app/src/server/jobs/db.ts']);
});

test('EZD-009 T20 convention checks and committed database types pass', () => {
  for (const args of [
    ['scripts/conventions/check.mjs', root],
    ['scripts/db/gen-types.mjs', '--check'],
  ]) {
    const run = spawnSync('node', args, { cwd: root, encoding: 'utf8' });
    assert.equal(run.status, 0, `${args.join(' ')}\n${run.stdout}\n${run.stderr}`);
  }
});

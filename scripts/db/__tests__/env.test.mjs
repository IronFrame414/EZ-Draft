// EZD-004b T7, T8, T19 (vault/plans/EZD-004b.md sections 3 and 4). node:test, Node 22 built-ins only.
// EZD-007c (vault/plans/EZD-007c.md section 4, EZD-004b T7 edit): SUPABASE_API_GATE_SECRET after SUPABASE_SECRET_KEY.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (...p) => readFileSync(path.join(repo, ...p), 'utf8');

const NAMES = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_API_GATE_SECRET',
  'EMAIL_TRANSPORT',
  'EMAIL_FROM',
  'RESEND_API_KEY',
  'CRON_SECRET',
  // EZD-024 Re-validation V9
  'SENTRY_TRANSPORT',
  'SENTRY_DSN',
  'ALERT_EMAIL_TO',
];

function namesFileLines() {
  return read('.env.example')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
}

test('EZD-004b T7 names file holds exactly the eleven names with empty values', () => {
  assert.deepEqual(
    namesFileLines(),
    NAMES.map((n) => `${n}=`),
  );
});

test('EZD-004b T8 variable names documented in docs/architecture.md', () => {
  const lines = read('docs', 'architecture.md').split('\n');
  const runtime = lines.findIndex((l) => l === '## Runtime');
  const hosting = lines.findIndex((l) => l === '### Hosting');
  const head = lines.findIndex((l) => l.trim() === '### Environment variables');
  assert.ok(runtime >= 0 && hosting > runtime, 'Runtime and Hosting headings');
  assert.ok(head > hosting, '### Environment variables after ### Hosting');
  for (const line of lines.slice(runtime + 1, head)) {
    assert.ok(!line.startsWith('## '), 'no other ## between Runtime and Environment variables');
  }
  let end = lines.findIndex((l, i) => i > head && l.startsWith('## '));
  if (end < 0) end = lines.length;
  const section = lines.slice(head + 1, end);
  for (const name of namesFileLines().map((l) => l.split('=')[0])) {
    const row = section.find((l) => {
      if (!l.trim().startsWith('|')) return false;
      return l.trim().replace(/^\|/, '').split('|')[0].trim() === `\`${name}\``;
    });
    assert.ok(row, `table row for ${name}`);
  }
  const r = spawnSync(
    process.execPath,
    [path.join(repo, 'scripts', 'conventions', 'check.mjs'), repo],
    { encoding: 'utf8' },
  );
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

test('EZD-004b T19 secret key stays out of the request path', () => {
  const src = path.join(repo, 'app', 'src');
  const serverDir = path.join(src, 'server') + path.sep;
  for (const file of walk(src)) {
    if (file.startsWith(serverDir)) continue;
    assert.ok(
      !readFileSync(file, 'utf8').includes('SUPABASE_SECRET_KEY'),
      `${path.relative(repo, file)} must not name SUPABASE_SECRET_KEY`,
    );
  }
  const named = [
    ['app', 'src', 'server', 'db', 'env.ts'],
    ['app', 'src', 'server', 'db', 'client.ts'],
    ['app', 'src', 'server', 'db', 'health.ts'],
    ['app', 'src', 'app', 'api', 'health', 'route.ts'],
  ];
  for (const p of named) {
    const text = read(...p);
    assert.ok(!text.includes('SUPABASE_SECRET_KEY'), `${p.join('/')} names the secret key`);
    assert.ok(!text.includes('service_role'), `${p.join('/')} names service_role`);
  }
});

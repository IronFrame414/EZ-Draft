// EZD-024 T19 (vault/plans/EZD-024.md Tests; Step 12): docs, env names, dependency rows, the secret-key rule
// for the errors folder, the repo checks, and the live-check script. node:test, Node 22 built-ins only. The
// live-check test gives main a fake fetch, so nothing reaches the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (...p) => readFileSync(path.join(repo, ...p), 'utf8');
const PLACEHOLDER_DSN = 'https://public@ezdraft.invalid/1';

// Lines of the section that starts at `heading` and ends before the next heading of the same or higher level.
function section(text, heading) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === heading);
  assert.ok(start >= 0, `${heading} exists`);
  const level = heading.match(/^#+/)[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n');
}

function filesUnder(dir) {
  const out = [];
  const root = path.join(repo, dir);
  if (!existsSync(root)) return out;
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const full = path.join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(root);
  return out;
}

test('EZD-024 T19 docs/architecture.md: the Error reporting subsection, env rows and Machine checks rows', () => {
  const arch = read('docs', 'architecture.md');
  const errors = section(arch, '## Errors and logging');
  assert.ok(errors.includes('### Error reporting (EZD-024)'), 'subsection under Errors and logging');
  const sub = section(arch, '### Error reporting (EZD-024)');
  for (const word of [
    'SENTRY_TRANSPORT',
    '/api/monitoring',
    'error_alert',
    'record_error_alert',
    'reportWebhookFailure',
    'ezd.source=worker',
  ]) {
    assert.ok(sub.includes(word), `subsection names ${word}`);
  }
  const env = section(arch, '### Environment variables');
  for (const name of [
    'SENTRY_TRANSPORT',
    'SENTRY_DSN',
    'SENTRY_STUB_DIR',
    'ALERT_EMAIL_TO',
    'SENTRY_ISSUES_URL',
  ]) {
    assert.ok(
      env.split('\n').some((l) => l.startsWith(`| \`${name}\``)),
      `env table row for ${name}`,
    );
  }
  const machine = section(arch, '## Machine checks')
    .split('\n')
    .filter((l) => l.startsWith('|'))
    .filter((l) => {
      const cells = l.split('|').map((c) => c.trim());
      return cells[cells.length - 2] === 'EZD-024';
    });
  assert.equal(machine.length, 3, 'three Machine checks rows end in EZD-024');
});

test('EZD-024 T19 every @sentry/ dependency has a Dependencies row, and all share one version', () => {
  const pkg = JSON.parse(read('app', 'package.json'));
  const declared = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).filter(([n]) =>
    n.startsWith('@sentry/'),
  );
  assert.ok(declared.length >= 1, 'app/package.json has an @sentry/ dependency');
  const rows = new Map();
  for (const line of section(read('docs', 'architecture.md'), '## Dependencies').split('\n')) {
    const m = line.match(/^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/);
    if (m) rows.set(m[1], m[2]);
  }
  for (const [name, version] of declared) {
    assert.equal(rows.get(name), version, `${name} row matches ${version}`);
  }
  const sentryVersions = new Set([...rows].filter(([n]) => n.startsWith('@sentry/')).map(([, v]) => v));
  assert.equal(sentryVersions.size, 1, 'one @sentry/* version');
});

test('EZD-024 T19 runbook section and .env.example names', () => {
  const runbook = section(read('docs', 'runbook.md'), '## Error reporting (EZD-024)');
  for (const word of ['SENTRY_DSN', 'ALERT_EMAIL_TO', 'live-check.mjs']) {
    assert.ok(runbook.includes(word), `runbook names ${word}`);
  }
  const lines = read('.env.example').split('\n').map((l) => l.trim());
  const names = lines.filter((l) => l !== '' && !l.startsWith('#')).map((l) => l.split('=')[0]);
  for (const name of ['SENTRY_TRANSPORT', 'SENTRY_DSN', 'ALERT_EMAIL_TO']) {
    assert.ok(names.includes(name), `.env.example has ${name}`);
  }
  assert.ok(lines.includes('# SENTRY_ISSUES_URL='), 'SENTRY_ISSUES_URL is a comment line');
  assert.ok(!names.includes('SENTRY_ISSUES_URL'));
});

test('EZD-024 T19 the errors folder and the tunnel never name the secret key or import jobs/db', () => {
  const files = [
    ...filesUnder('app/src/server/errors'),
    ...filesUnder('app/src/app/api/monitoring'),
  ].filter((f) => !/\.(test|spec)\./.test(f));
  assert.ok(files.length >= 1, 'non-test files exist');
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    assert.ok(!text.includes('SUPABASE_SECRET_KEY'), `${file} does not name the secret key`);
    assert.ok(!/from\s+['"][^'"]*jobs\/db['"]/.test(text), `${file} does not import jobs/db`);
  }
});

test('EZD-024 T19 the repo checks pass (conventions, generated types)', () => {
  for (const args of [
    ['scripts/conventions/check.mjs', '.'],
    ['scripts/db/gen-types.mjs', '--check'],
  ]) {
    const run = spawnSync('node', args, { cwd: repo, encoding: 'utf8' });
    assert.equal(run.status, 0, `${args.join(' ')}\n${run.stdout}\n${run.stderr}`);
  }
});

function parseEnvelope(value) {
  if (Array.isArray(value)) {
    return { header: value[0], items: value[1].map(([header, payload]) => ({ header, payload })) };
  }
  const text = typeof value === 'string' ? value : new globalThis.TextDecoder().decode(value);
  const lines = text.split('\n').filter((l) => l !== '');
  const items = [];
  for (let i = 1; i + 1 < lines.length; i += 2) {
    items.push({ header: JSON.parse(lines[i]), payload: JSON.parse(lines[i + 1]) });
  }
  return { header: JSON.parse(lines[0]), items };
}

test('EZD-024 T19 live-check.mjs: buildCheckEnvelope, refuses under CI, not in a root script', async () => {
  const mod = await import(pathToFileURL(path.join(repo, 'scripts', 'errors', 'live-check.mjs')).href);
  const nonce = 'abcdefghijkl';
  const envelope = parseEnvelope(mod.buildCheckEnvelope({ nonce }));
  assert.equal(envelope.header.dsn, PLACEHOLDER_DSN);
  const events = envelope.items.filter((i) => i.header.type === 'event');
  assert.equal(events.length, 1);
  assert.ok(JSON.stringify(events[0].payload).includes(nonce));

  let calls = 0;
  const fake = async () => {
    calls += 1;
    return new globalThis.Response('{}', { status: 200 });
  };
  const code = await mod.main([], { CI: '1' }, fake);
  assert.equal(code, 1);
  assert.equal(calls, 0);

  const scripts = JSON.parse(read('package.json')).scripts;
  for (const name of ['typecheck', 'lint', 'test', 'build']) {
    assert.ok(!String(scripts[name] ?? '').includes('live-check'), `root ${name} script`);
  }
});

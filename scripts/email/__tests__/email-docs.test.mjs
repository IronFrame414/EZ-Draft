// EZD-008b T10a, T10b, T11, T11e-g, T12 (vault/plans/EZD-008b.md sections 3 and 4).
// node:test, Node 22 built-ins only. No test makes a network request: main always gets a fake fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (...p) => readFileSync(path.join(repo, ...p), 'utf8');
const loadModule = () => import('../send-test.mjs');

const TO = 'josh@example.test';
const FROM = 'EZ Draft Test <test@example.test>';
const KEY = 're_fake';
const APP = 'https://ezdraft.ezcontractorbinder.com/';
const ARGV_OK = ['--to', TO];
const envOk = (extra = {}) => ({ RESEND_API_KEY: KEY, EMAIL_FROM: FROM, ...extra });

function makeFake(result) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push([url, init]);
    if (result instanceof Error) throw result;
    return new Response(JSON.stringify(result.body), { status: result.status });
  };
  fn.calls = calls;
  return fn;
}
function makeIo() {
  const lines = [];
  return { lines, log: (l) => lines.push(String(l)), error: (l) => lines.push(String(l)) };
}

function sectionOf(lines, headIndex, stopRe) {
  let end = lines.findIndex((l, i) => i > headIndex && stopRe.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(headIndex + 1, end);
}
const cells = (l) =>
  l
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

test('EZD-008b done when: email names are in .env.example and documented in docs/architecture.md', () => {
  const envLines = read('.env.example').split('\n').map((l) => l.trim());
  for (const n of ['EMAIL_TRANSPORT=', 'EMAIL_FROM=', 'RESEND_API_KEY=']) {
    assert.ok(envLines.includes(n), `.env.example has ${n}`);
  }
  assert.ok(!envLines.some((l) => l.startsWith('EMAIL_STUB_DIR')), 'no EMAIL_STUB_DIR');

  const lines = read('docs', 'architecture.md').split('\n');
  const runtime = lines.findIndex((l) => l === '## Runtime');
  const envHead = lines.findIndex((l) => l.trim() === '### Environment variables');
  const emailHead = lines.findIndex((l) => l.trim() === '### Email (EZD-008)');
  const named = lines.findIndex((l) => l === '## Named tools');
  assert.ok(runtime >= 0 && envHead > runtime, 'Environment variables under Runtime');
  assert.ok(emailHead > envHead, '### Email (EZD-008) after Environment variables');
  assert.ok(emailHead < named, '### Email (EZD-008) before ## Named tools');
  for (const l of lines.slice(runtime + 1, emailHead)) {
    assert.ok(!l.startsWith('## '), 'no ## between Runtime and Email heading');
  }

  const envSection = sectionOf(lines, envHead, /^##/);
  const rowFor = (name) => {
    const rows = envSection.filter(
      (l) => l.trim().startsWith('|') && cells(l)[0] === `\`${name}\``,
    );
    assert.equal(rows.length, 1, `one row for ${name}`);
    assert.equal(cells(rows[0]).length, 5, `${name} row has five cells`);
    assert.equal(cells(rows[0])[1], 'never', `${name} second cell`);
    return rows[0];
  };
  for (const n of ['EMAIL_TRANSPORT', 'EMAIL_FROM', 'RESEND_API_KEY', 'EMAIL_STUB_DIR']) rowFor(n);
  const from = rowFor('EMAIL_FROM');
  assert.ok(from.includes('no-reply@ezcontractorbinder.com'));
  assert.ok(from.includes('EZ Draft Test <test@example.test>'));
  const transport = rowFor('EMAIL_TRANSPORT');
  for (const s of ['stub', 'resend', 'Q-0041']) assert.ok(transport.includes(s), s);

  const emailSection = sectionOf(lines, emailHead, /^##/).join('\n');
  for (const s of [
    'app/src/server/email/',
    'EMAIL_TRANSPORT',
    'scripts/email/send-test.mjs',
    'via EZ Draft',
    'Copy link',
    'Q-0035',
    'Q-0036',
    'Q-0041',
    'EZD-007',
    'docs/runbook.md',
  ]) {
    assert.ok(emailSection.includes(s), `Email section contains ${s}`);
  }

  const testsHead = lines.findIndex((l) => l === '## Tests');
  assert.ok(testsHead >= 0, '## Tests');
  const testsSection = sectionOf(lines, testsHead, /^## /).join('\n');
  for (const s of ['readStubOutbox', 'EMAIL_STUB_DIR', 'app/test-harness/email-outbox.ts']) {
    assert.ok(testsSection.includes(s), `Tests section contains ${s}`);
  }

  const mcHead = lines.findIndex((l) => l === '## Machine checks');
  const ciHead = lines.findIndex((l) => l.trim() === '### CI');
  assert.ok(mcHead >= 0 && ciHead > mcHead, 'Machine checks before CI');
  const mcRows = lines
    .slice(mcHead + 1, ciHead)
    .filter((l) => l.trim().startsWith('|'))
    .map(cells);
  for (const [file, by] of [
    ['app/src/server/email/email.test.ts', 'EZD-008a'],
    ['scripts/email/__tests__/email-docs.test.mjs', 'EZD-008b'],
  ]) {
    const row = mcRows.find((c) => c.length === 4 && c[2].replaceAll('`', '') === file);
    assert.ok(row, `Machine checks row for ${file}`);
    assert.equal(row[3], by);
  }

  const depHead = lines.findIndex((l) => l === '## Dependencies');
  const depRows = sectionOf(lines, depHead, /^## /)
    .filter((l) => l.trim().startsWith('|'))
    .map(cells)
    .filter((c) => c[0] === '`resend`');
  assert.equal(depRows.length, 1, 'one resend row');
  const appPkg = JSON.parse(read('app', 'package.json'));
  assert.equal(depRows[0][1].replaceAll('`', ''), appPkg.dependencies.resend);
  assert.equal(depRows[0][1], '`6.34.1`');
  assert.ok(depRows[0][2].includes('app'));

  const r = spawnSync(process.execPath, [path.join(repo, 'scripts', 'conventions', 'check.mjs'), repo], {
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  });

test('EZD-008b done when: the runbook has Josh\'s email steps', () => {
  const lines = read('docs', 'runbook.md').split('\n');
  const heads = lines
    .map((l, i) => [l, i])
    .filter(([l]) => l === '## Email (EZD-008)')
    .map(([, i]) => i);
  assert.equal(heads.length, 1, 'exactly one Email heading');
  const tenant = lines.findIndex((l) => l === '## Tenant 1 setup (EZD-005)');
  assert.ok(tenant >= 0 && heads[0] > tenant, 'after Tenant 1 setup');
  const section = sectionOf(lines, heads[0], /^## /);
  const text = section.join('\n');
  for (const s of [
    'Resend',
    'Sending access',
    'ezdraft-production',
    'EMAIL_TRANSPORT',
    'EMAIL_FROM',
    'RESEND_API_KEY',
    'no-reply@ezcontractorbinder.com',
    'send-test.mjs',
    'smtp.resend.com',
    '465',
    'ezdraft-dev-auth',
  ]) {
    assert.ok(text.includes(s), `runbook section contains ${s}`);
  }
  for (let n = 1; n <= 7; n++) {
    assert.ok(section.some((l) => l.startsWith(`${n}. `)), `step ${n}`);
  }
  const six = section.find((l) => l.startsWith('6. '));
  assert.ok(six.includes('smtp.resend.com'), 'step 6 is the SMTP step');
  assert.ok(!text.includes('Add Domain'));
  assert.ok(!/\bre_[A-Za-z0-9]{8,}/.test(text), 'no key pasted');
});

test('EZD-008b done when: the live check sends nothing without its key or under CI', async () => {
  const m = await loadModule();
  assert.equal(m.RESEND_URL, 'https://api.resend.com/emails');
  assert.equal(m.APP_URL, APP);
  assert.equal(m.SUBJECT, 'EZ Draft email check');

  const req = m.buildTestRequest({ to: TO, from: FROM, appUrl: APP, apiKey: KEY });
  assert.equal(req.url, 'https://api.resend.com/emails');
  assert.equal(req.method, 'POST');
  assert.equal(req.headers.Authorization, 'Bearer re_fake');
  assert.equal(req.headers['Content-Type'], 'application/json');
  const body = JSON.parse(req.body);
  assert.deepEqual(Object.keys(body).sort(), ['from', 'html', 'subject', 'text', 'to']);
  assert.equal(body.to, TO);
  assert.equal(body.from, FROM);
  assert.equal(body.subject, 'EZ Draft email check');
  assert.deepEqual(body.text.match(/https?:\/\/[^\s<>"']+/g), [APP]);
  const hrefs = [...body.html.matchAll(/href="([^"]*)"/g)].map((x) => x[1]);
  assert.deepEqual(hrefs, [APP]);

  const cases = {
    a: [[], envOk()],
    b: [ARGV_OK, { EMAIL_FROM: FROM }],
    b2: [ARGV_OK, envOk({ RESEND_API_KEY: '   ' })],
    c: [ARGV_OK, { RESEND_API_KEY: KEY }],
    d: [ARGV_OK, envOk({ CI: '1' })],
    d2: [ARGV_OK, envOk({ CI: 'true' })],
    h: [['--to', 'not-an-email'], envOk()],
    i: [[...ARGV_OK, '--cc', 'x@example.test'], envOk()],
  };
  for (const [name, [argv, env]] of Object.entries(cases)) {
    const fake = makeFake({ status: 200, body: { id: 're_never' } });
    const io = makeIo();
    const code = await m.main(argv, env, fake, io);
    assert.equal(code, 1, `case ${name} exit code`);
    assert.equal(fake.calls.length, 0, `case ${name} sends nothing`);
    assert.ok(!io.lines.some((l) => l.includes(KEY)), `case ${name} prints no key`);
  }
});

test('EZD-008b live check send results', async () => {
  const m = await loadModule();
  const run = async (result) => {
    const fake = makeFake(result);
    const io = makeIo();
    const code = await m.main(ARGV_OK, envOk(), fake, io);
    assert.ok(!io.lines.some((l) => l.includes(KEY)), 'no key in output');
    return { code, fake, io };
  };

  const e = await run({ status: 200, body: { id: 're_9' } });
  assert.equal(e.code, 0);
  assert.equal(e.fake.calls.length, 1);
  assert.equal(e.fake.calls[0][0], 'https://api.resend.com/emails');
  assert.equal(e.fake.calls[0][1].method, 'POST');
  assert.equal(e.fake.calls[0][1].headers.Authorization, 'Bearer re_fake');
  assert.ok(e.io.lines.some((l) => l.includes('re_9')));

  const f = await run({ status: 422, body: { name: 'validation_error', message: 'x' } });
  assert.equal(f.code, 1);
  assert.ok(f.io.lines.some((l) => l.includes('422') && l.includes('validation_error')) ||
    (f.io.lines.some((l) => l.includes('422')) && f.io.lines.some((l) => l.includes('validation_error'))));

  const g = await run(new TypeError('fetch failed'));
  assert.equal(g.code, 1);
  assert.ok(g.io.lines.some((l) => l.includes('TypeError')));

  const j = await run({ status: 200, body: {} });
  assert.equal(j.code, 1);
});

test('EZD-008b done when: the live check never runs in the gate', async () => {
  const pkgPaths = ['package.json', 'app/package.json', 'worker/package.json'];
  const geo = path.join(repo, 'packages');
  if (existsSync(geo)) {
    const { readdirSync } = await import('node:fs');
    for (const d of readdirSync(geo)) pkgPaths.push(`packages/${d}/package.json`);
  }
  for (const p of pkgPaths) {
    if (!existsSync(path.join(repo, p))) continue;
    const scripts = JSON.parse(read(p)).scripts ?? {};
    for (const [k, v] of Object.entries(scripts)) {
      assert.ok(!v.includes('send-test') && !v.includes('scripts/email'), `${p} script ${k}`);
    }
  }
  const gate = read('scripts', 'gate.mjs');
  assert.ok(!gate.includes('send-test') && !gate.includes('scripts/email'));
  assert.ok(gate.includes("CI: '1'"));
  assert.ok(JSON.parse(read('package.json')).scripts.test.includes('"scripts/**/*.test.mjs"'));
  assert.ok(!path.basename('scripts/email/send-test.mjs').endsWith('.test.mjs'));

  const realFetch = globalThis.fetch;
  const calls = [];
  const before = process.exitCode;
  globalThis.fetch = async (...a) => {
    calls.push(a);
    return new Response('{}');
  };
  try {
    await import('../send-test.mjs?t12');
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(calls.length, 0);
  assert.equal(process.exitCode, before);
  assert.equal(globalThis.fetch, realFetch);
});

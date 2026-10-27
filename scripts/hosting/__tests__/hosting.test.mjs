// EZD-003 T1-T6 (vault/plans/EZD-003.md sections 3 and 4). Offline; Node built-ins only; no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (...p) => readFileSync(path.join(repo, ...p), 'utf8');
const readJson = (...p) => JSON.parse(read(...p));
const loadCheck = () => import(pathToFileURL(path.join(repo, 'scripts', 'hosting', 'check-live.mjs')).href);

const ID_ORDER = ['dns', 'tls', 'status', 'host', 'vercel', 'title', 'hsts', 'redirect'];
const GOOD = () => ({
  https: {
    status: 200,
    finalUrl: 'https://ezdraft.ezcontractorbinder.com/',
    headers: { server: 'Vercel', 'strict-transport-security': 'max-age=63072000' },
    body: '<html><head><title>EZ Draft</title></head></html>',
  },
  http: { status: 308, location: 'https://ezdraft.ezcontractorbinder.com/' },
});

// Text of the section that starts at heading line `start` and ends at the next heading of level <= its own.
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

test('EZD-003 T1 Vercel config: app/vercel.json pins framework and region, no env, no root vercel.json', () => {
  const cfg = readJson('app', 'vercel.json');
  assert.equal(cfg.framework, 'nextjs');
  assert.deepEqual(cfg.regions, ['iad1']);
  assert.ok(!('env' in cfg), 'no env key');
  assert.ok(!(cfg.build && 'env' in cfg.build), 'no build.env key');
  assert.equal(existsSync(path.join(repo, 'vercel.json')), false, 'no vercel.json at the repo root');
});

test('EZD-003 T2 Node and pnpm on Vercel: engines match the root and ci.yml', () => {
  const app = readJson('app', 'package.json');
  const root = readJson('package.json');
  assert.equal(app.engines?.node, '22.x');
  assert.equal(app.engines.node, root.engines.node);
  assert.ok(read('.github', 'workflows', 'ci.yml').includes('node-version: 22'));
  if ('packageManager' in app) assert.equal(app.packageManager, root.packageManager);
});

test('EZD-003 T3 Live check passes on a good site', async () => {
  const { evaluate } = await loadCheck();
  const r = evaluate(GOOD());
  assert.equal(r.ok, true);
  assert.deepEqual(r.results.map((x) => x.id), ID_ORDER);
  for (const x of r.results) assert.equal(x.pass, true, x.id);
});

test('EZD-003 T4 Live check fails each way', async () => {
  const { evaluate } = await loadCheck();
  const cases = [
    ['a', (o) => { o.https = { error: { code: 'ENOTFOUND' } }; }, 'dns'],
    ['b', (o) => { o.https = { error: { code: 'CERT_HAS_EXPIRED' } }; }, 'tls'],
    ['c', (o) => { o.https.status = 404; }, 'status'],
    ['d', (o) => { o.https.finalUrl = 'https://ezcontractorbinder.com/'; }, 'host'],
    ['e', (o) => { delete o.https.headers.server; }, 'vercel'],
    ['f', (o) => { o.https.body = '<html><head><title>EZ Binder</title></head></html>'; }, 'title'],
    ['g', (o) => { delete o.https.headers['strict-transport-security']; }, 'hsts'],
    ['h', (o) => { o.http = { status: 200 }; }, 'redirect'],
    ['i', (o) => { o.http = { status: 308, location: 'http://ezdraft.ezcontractorbinder.com/' }; }, 'redirect'],
  ];
  for (const [name, mutate, failId] of cases) {
    const obs = GOOD();
    mutate(obs);
    const r = evaluate(obs);
    assert.equal(r.ok, false, `case ${name}: ok`);
    assert.deepEqual(r.results.map((x) => x.id), ID_ORDER, `case ${name}: ids`);
    const failIdx = ID_ORDER.indexOf(failId);
    for (const [idx, x] of r.results.entries()) {
      if (name === 'a' || name === 'b') {
        if (idx < failIdx) assert.equal(x.pass, true, `case ${name}: ${x.id} passes`);
        else if (idx === failIdx) assert.equal(x.pass, false, `case ${name}: ${x.id} fails`);
        else {
          assert.equal(x.pass, false, `case ${name}: ${x.id} skipped`);
          assert.equal(x.detail, 'skipped', `case ${name}: ${x.id} detail`);
        }
      } else {
        assert.equal(x.pass, x.id !== failId, `case ${name}: ${x.id}`);
      }
    }
  }
});

test('EZD-003 T5 Live check stays out of the gate', async () => {
  const root = readJson('package.json');
  for (const name of ['typecheck', 'lint', 'test', 'build']) {
    assert.ok(!String(root.scripts[name] ?? '').includes('check-live'), `root script ${name}`);
  }
  const self = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  assert.ok(!self.includes('observe' + '('), 'this test file never calls the network observer');
  const { HOST } = await loadCheck();
  assert.equal(HOST, 'ezdraft.ezcontractorbinder.com');
});

test('EZD-003 T6 Docs: architecture Hosting subsection, Machine checks rows, runbook section', () => {
  const arch = read('docs', 'architecture.md');
  const lines = arch.split(/\r?\n/);
  const runtime = lines.findIndex((l) => /^## Runtime\s*$/.test(l));
  assert.ok(runtime >= 0, '## Runtime exists');
  let next = lines.findIndex((l, i) => i > runtime && /^## /.test(l));
  if (next < 0) next = lines.length;
  const hostingIdx = lines.findIndex((l, i) => i > runtime && i < next && /^### Hosting\s*$/.test(l));
  assert.ok(hostingIdx > runtime, '### Hosting sits between ## Runtime and the next ##');
  const hosting = sectionOf(arch, /^### Hosting\s*$/);
  for (const s of ['ezdraft.ezcontractorbinder.com', 'app/vercel.json', 'iad1', '22.x', 'main', 'develop',
    'scripts/hosting/check-live.mjs']) {
    assert.ok(hosting.includes(s), `Hosting mentions ${s}`);
  }

  const machine = sectionOf(arch, /^## Machine checks\s*$/);
  // Only the table lines before the ### CI subsection.
  const tableRows = machine.split(/\r?\n/).slice(0, machine.split(/\r?\n/).findIndex((l) => /^### /.test(l)) >>> 0 || undefined)
    .filter((l) => l.startsWith('|'))
    .map((l) => l.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim()));
  const mine = tableRows.filter((cells) => cells.length === 4 && cells[3] === 'EZD-003');
  assert.equal(mine.length, 2, 'two Machine checks rows built by EZD-003');

  const r = spawnSync(process.execPath, [path.join(repo, 'scripts', 'conventions', 'check.mjs'), repo], {
    encoding: 'utf8',
    env: (() => { const e = { ...process.env }; delete e.EZD_TEST_GREP; delete e.EZD_PHASE; delete e.NODE_TEST_CONTEXT; return e; })(),
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);

  const runbook = sectionOf(read('docs', 'runbook.md'), /^## Vercel and the subdomain \(EZD-003\)\s*$/);
  assert.ok(runbook !== null, 'runbook section exists');
  for (const s of ['Root Directory', 'CNAME', 'ezdraft', 'ENABLE_EXPERIMENTAL_COREPACK', 'Ignored Build Step',
    'Auto-assign Custom Production Domains']) {
    assert.ok(runbook.includes(s), `runbook mentions ${s}`);
  }
});

// EZD-149 T1-T2 (vault/plans/EZD-149.md sections 3, 4 and 6). Offline; Node built-ins only; no network.

// T1: a fail case changes only `redirect` or `host`; every other check of GOOD() still passes.
function assertOnlyFails(r, failId) {
  assert.equal(r.ok, false, 'ok is false');
  assert.deepEqual(r.results.map((x) => x.id), ID_ORDER, 'ids in order');
  for (const x of r.results) assert.equal(x.pass, x.id !== failId, `${x.id} pass is ${x.id !== failId}`);
}

test('EZD-149 T1 j Live check refuses a redirect to a look-alike host', async () => {
  const { evaluate } = await loadCheck();
  const obs = GOOD();
  obs.http = { status: 308, location: 'https://ezdraft.ezcontractorbinder.com.evil.example/' };
  assertOnlyFails(evaluate(obs), 'redirect');
});

test('EZD-149 T1 k Live check refuses a redirect to the right host on another port', async () => {
  const { evaluate } = await loadCheck();
  const obs = GOOD();
  obs.http = { status: 308, location: 'https://ezdraft.ezcontractorbinder.com:8443/' };
  assertOnlyFails(evaluate(obs), 'redirect');
});

test('EZD-149 T1 l Live check refuses a relative redirect Location', async () => {
  const { evaluate } = await loadCheck();
  const obs = GOOD();
  obs.http = { status: 308, location: '/' };
  assertOnlyFails(evaluate(obs), 'redirect');
});

test('EZD-149 T1 m Live check refuses a redirect Location with a user name', async () => {
  const { evaluate } = await loadCheck();
  const obs = GOOD();
  obs.http = { status: 308, location: 'https://user@ezdraft.ezcontractorbinder.com/' };
  assertOnlyFails(evaluate(obs), 'redirect');
});

test('EZD-149 T1 n Live check refuses a redirect that names the site only in its query', async () => {
  const { evaluate } = await loadCheck();
  const obs = GOOD();
  obs.http = { status: 308, location: 'https://evil.example/?https://ezdraft.ezcontractorbinder.com' };
  assertOnlyFails(evaluate(obs), 'redirect');
});

test('EZD-149 T1 o Live check refuses a final URL on another port', async () => {
  const { evaluate } = await loadCheck();
  const obs = GOOD();
  obs.https.finalUrl = 'https://ezdraft.ezcontractorbinder.com:8443/';
  assertOnlyFails(evaluate(obs), 'host');
});

test('EZD-149 T1 p Live check passes a redirect to the site with an upper-case host', async () => {
  const { evaluate } = await loadCheck();
  const obs = GOOD();
  obs.http = { status: 308, location: 'https://EZDRAFT.ezcontractorbinder.com/sign-in' };
  const r = evaluate(obs);
  assert.equal(r.ok, true);
  assert.deepEqual(r.results.map((x) => x.id), ID_ORDER);
  for (const x of r.results) assert.equal(x.pass, true, x.id);
});

// T2: the Ignored Build Step command (vault/plans/EZD-149.md section 3, CMD).
const SECTION3_CMD = '[ "$VERCEL_GIT_COMMIT_REF" = "main" ] && exit 1; '
  + '[ "$VERCEL_GIT_COMMIT_REF" = "develop" ] && [ -n "$VERCEL_GIT_PULL_REQUEST_ID" ] && exit 1; exit 0';
const RUNBOOK_HEADING = '**Build and branch settings** (done 2026-10-19; EZD-149 changed the Ignored Build Step command below: paste it again in Vercel).';
const RUNBOOK_SENTENCE = 'Production builds only from `main`. A preview builds only for a pull request from `develop` (the phase PR); a plain `develop` push and a pull request from any other branch build nothing.';
const ARCH_BULLET = '- Previews only for the phase PR, read as a pull request from `develop` (Vercel names no target branch), through the Ignored Build Step in the Vercel project; a pull request from any other branch builds nothing. A plain `develop` push builds no preview; the gate\'s empty `chore: preview` commit after the PR opens gives the PR its preview. Previews use the dev database once EZD-023b enters its values.';

// The command as the runbook gives it to Josh (the text he pastes into Vercel).
function runbookCmd() {
  const section = sectionOf(read('docs', 'runbook.md'), /^## Vercel and the subdomain \(EZD-003\)\s*$/);
  assert.ok(section !== null, 'runbook section exists');
  const line = section.split(/\r?\n/).find((l) => l.includes('**Ignored Build Step**'));
  assert.ok(line !== undefined, 'runbook has an Ignored Build Step line');
  const m = /with exactly: `([^`]+)`/.exec(line);
  assert.ok(m !== null, 'runbook line names the command');
  return m[1];
}

// The command as vault/PROCESS.md section 12 gives it.
function processCmd() {
  const section = sectionOf(read('vault', 'PROCESS.md'), /^## 12\. CI and deploys \(keep GitHub Actions usage low\)\s*$/);
  assert.ok(section !== null, 'PROCESS.md section 12 exists');
  const line = section.split(/\r?\n/).find((l) => l.includes('Ignored Build Step to:'));
  assert.ok(line !== undefined, 'PROCESS.md has an Ignored Build Step line');
  const m = /Ignored Build Step to: `([^`]+)`/.exec(line);
  assert.ok(m !== null, 'PROCESS.md line names the command');
  return m[1];
}

// Runs the command with only the given Vercel variables; `undefined` means the variable is absent.
function runCmd(cmd, ref, pr) {
  const env = { PATH: process.env.PATH };
  if (ref !== undefined) env.VERCEL_GIT_COMMIT_REF = ref;
  if (pr !== undefined) env.VERCEL_GIT_PULL_REQUEST_ID = pr;
  const r = spawnSync('/bin/sh', ['-c', cmd], { env, encoding: 'utf8' });
  return r.status;
}

test('EZD-149 T2 1 Ignored Build Step: production branch main builds (exit 1)', () => {
  assert.equal(runCmd(runbookCmd(), 'main', undefined), 1);
});

test('EZD-149 T2 2 Ignored Build Step: a plain develop push builds nothing (exit 0)', () => {
  assert.equal(runCmd(runbookCmd(), 'develop', ''), 0);
});

test('EZD-149 T2 3 Ignored Build Step: the develop pull request (phase PR) builds a preview (exit 1)', () => {
  assert.equal(runCmd(runbookCmd(), 'develop', '12'), 1);
});

test('EZD-149 T2 4 Ignored Build Step: a pull request from another branch builds nothing (exit 0)', () => {
  assert.equal(runCmd(runbookCmd(), 't/EZD-999', '13'), 0);
});

test('EZD-149 T2 5 Ignored Build Step: a branch push that is not a pull request builds nothing (exit 0)', () => {
  assert.equal(runCmd(runbookCmd(), 't/EZD-999', ''), 0);
});

test('EZD-149 T2 6 Ignored Build Step: both variables absent builds nothing (exit 0)', () => {
  assert.equal(runCmd(runbookCmd(), undefined, undefined), 0);
});

test('EZD-149 T2 7 Docs and the Vercel command say the same thing: runbook and PROCESS.md equal the command', () => {
  assert.equal(runbookCmd(), SECTION3_CMD, 'runbook command');
  assert.equal(processCmd(), SECTION3_CMD, 'PROCESS.md command');
});

test('EZD-149 T2 8 Docs say the same thing: runbook, architecture Hosting and Machine checks hold the section 6 text', () => {
  const runbook = sectionOf(read('docs', 'runbook.md'), /^## Vercel and the subdomain \(EZD-003\)\s*$/);
  assert.ok(runbook.includes(RUNBOOK_HEADING), 'runbook step 2 heading text');
  assert.ok(runbook.includes(RUNBOOK_SENTENCE), 'runbook sentence after the command');

  const arch = read('docs', 'architecture.md');
  const hosting = sectionOf(arch, /^### Hosting\s*$/);
  assert.ok(hosting !== null, '### Hosting exists');
  assert.ok(hosting.includes(ARCH_BULLET), 'architecture Hosting bullet');

  const machine = sectionOf(arch, /^## Machine checks\s*$/);
  const rows = machine.split(/\r?\n/)
    .filter((l) => l.startsWith('|'))
    .map((l) => l.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim()));
  const mine = rows.filter((cells) => cells[cells.length - 1] === 'EZD-149');
  assert.equal(mine.length, 1, 'one Machine checks row built by EZD-149');
  assert.equal(mine[0][2], 'scripts/hosting/__tests__/hosting.test.mjs (EZD-149 T2)', 'row names the test');
});

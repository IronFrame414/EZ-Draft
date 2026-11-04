// EZD-004c T1, T1b, T2, T3, T4 (vault/plans/EZD-004c.md sections 3 and 4). node:test, Node 22 built-ins only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WF = path.join(repo, '.github', 'workflows', 'supabase-dev.yml');
const read = (...p) => readFileSync(path.join(repo, ...p), 'utf8');

function childEnv(extra = {}) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.EZD_TEST_GREP;
  delete env.EZD_PHASE;
  return Object.assign(env, extra);
}

const pnpmVersion = () => read('package.json').match(/"packageManager"\s*:\s*"pnpm@([^"]+)"/)[1];

// ---------- checker (line based, no YAML package; forms it does not parse are problems) ----------
const indentOf = (l) => l.length - l.trimStart().length;
const isBlank = (l) => l.trim() === '' || l.trim().startsWith('#');

// lines deeper than lines[i], up to the next non-blank line at indent <= lines[i]'s
function blockAfter(lines, i) {
  const base = indentOf(lines[i]);
  const out = [];
  for (let k = i + 1; k < lines.length; k++) {
    if (isBlank(lines[k])) continue;
    if (indentOf(lines[k]) <= base) break;
    out.push(lines[k]);
  }
  return out;
}
function directChildren(block) {
  if (block.length === 0) return [];
  const min = Math.min(...block.map(indentOf));
  return block.filter((l) => indentOf(l) === min).map((l) => l.trim());
}
const sameSet = (a, b) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

function checkDevWorkflow(text, version) {
  const problems = [];
  const lines = text.split('\n');
  const trimmed = lines.map((l) => l.trim());
  const add = (m) => problems.push(m);
  const topIdx = (re) => lines.findIndex((l) => indentOf(l) === 0 && re.test(l));

  // (a) on
  const on = topIdx(/^on\s*:/);
  if (on < 0 || lines[on].trim() !== 'on:') add('on: must be block form');
  else {
    const blk = blockAfter(lines, on);
    if (!sameSet(directChildren(blk), ['push:', 'workflow_dispatch:'])) add('on: children');
    const p = lines.findIndex((l, k) => k > on && l.trim() === 'push:');
    if (p < 0 || !sameSet(directChildren(blockAfter(lines, p)).map((s) => s.split(':')[0] + ':'), ['branches:', 'paths:'])) add('push children');
    if (!trimmed.includes('branches: [develop]')) add('push branches');
    if (!trimmed.includes("paths: ['supabase/migrations/**']")) add('push paths');
  }

  // (b) permissions
  const perms = lines.filter((l) => /^\s*permissions\s*:/.test(l));
  const pi = topIdx(/^permissions\s*:/);
  if (perms.length !== 1) add('exactly one permissions line');
  if (pi < 0 || lines[pi].trim() !== 'permissions:') add('top-level permissions block');
  else if (!sameSet(directChildren(blockAfter(lines, pi)), ['contents: read'])) add('permissions children');

  // (c) concurrency
  const ci = topIdx(/^concurrency\s*:/);
  if (ci < 0 || lines[ci].trim() !== 'concurrency:') add('concurrency block');
  else if (!sameSet(directChildren(blockAfter(lines, ci)), ['group: supabase-dev', 'cancel-in-progress: false'])) add('concurrency children');

  // (d) jobs
  const ji = topIdx(/^jobs\s*:/);
  if (ji < 0 || lines[ji].trim() !== 'jobs:') add('jobs block');
  else if (!sameSet(directChildren(blockAfter(lines, ji)), ['migrate:'])) add('exactly one job migrate');
  for (const s of ['runs-on: ubuntu-latest', 'timeout-minutes: 15', "if: github.ref == 'refs/heads/develop'"]) {
    if (!trimmed.includes(s)) add(`missing ${s}`);
  }
  const envs = trimmed.filter((l) => /^environment\s*:/.test(l));
  if (envs.length !== 1 || envs[0] !== 'environment: dev') add('environment: dev exactly once');

  // (e) uses
  const owners = new Set();
  for (const l of lines) {
    const m = l.match(/^\s*(?:-\s+)?['"]?uses['"]?\s*:\s*(.*)$/);
    if (!m) continue;
    const v = m[1].replace(/\s+#.*$/, '').trim().replace(/^['"]|['"]$/g, '');
    if (!/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/.test(v)) add(`uses not pinned: ${v}`);
    owners.add(v.split('@')[0]);
  }
  if (!sameSet([...owners], ['actions/checkout', 'actions/setup-node'])) add('uses set');

  // (f)
  if (!trimmed.includes('persist-credentials: false')) add('persist-credentials: false');
  if (!trimmed.includes('node-version: 22')) add('node-version: 22');
  if (trimmed.some((l) => /^cache\s*:/.test(l))) add('no cache key');

  // (g)
  if (!trimmed.includes(`run: npm install -g pnpm@${version}`)) add('pnpm install line');
  if (!trimmed.includes('run: pnpm install --frozen-lockfile')) add('frozen lockfile line');

  // (h) the only expression
  const ENVLINE = 'SUPABASE_DEV_DB_URL: ${{ secrets.SUPABASE_DEV_DB_URL }}';
  const exprs = lines.filter((l) => l.includes('${{'));
  if (exprs.length !== 1 || exprs[0].trim() !== ENVLINE) add('only expression is the env line');
  const si = lines.findIndex((l) => l.trim() === '- name: Push migrations to ezdraft-dev');
  if (si < 0) add('push step missing');
  else {
    const dashIndent = indentOf(lines[si]);
    for (let k = si + 1; k < lines.length; k++) {
      if (isBlank(lines[k])) continue;
      if (indentOf(lines[k]) < dashIndent || (indentOf(lines[k]) === dashIndent && lines[k].trim().startsWith('- '))) {
        add('push step is not last');
        break;
      }
    }
    const body = lines.slice(si);
    const ei = body.findIndex((l) => l.trim() === 'env:');
    if (ei < 0) add('push step env');
    else if (!sameSet(directChildren(blockAfter(body, ei)), [ENVLINE])) add('env has exactly one key, the secret');
    // (i) EZD-146: the push goes through scripts/db/dev-push.mjs
    if (!body.join('\n').includes('node scripts/db/dev-push.mjs')) add('push command');
  }

  // (k) EZD-146: no password-bearing --db-url anywhere in the file
  if (text.includes('--db-url')) add('password-bearing --db-url');

  // (j)
  const lower = text.toLowerCase();
  for (const s of ['link', 'supabase_access_token', 'prod', 'set -x', 'upload-artifact', 'continue-on-error', 'pull_request', 'workflow_run', 'schedule', '--include-all']) {
    if (lower.includes(s)) add(`forbidden: ${s}`);
  }
  return problems;
}

const realText = () => readFileSync(WF, 'utf8');

test('EZD-004c T1 Workflow is pinned and dev-only (AC-EZD-004c-1)', () => {
  assert.ok(existsSync(WF), '.github/workflows/supabase-dev.yml exists');
  assert.deepEqual(checkDevWorkflow(realText(), pnpmVersion()), []);
});

test('EZD-004c T1b Checker catches each bypass (AC-EZD-004c-1)', () => {
  const real = realText();
  const v = pnpmVersion();
  assert.deepEqual(checkDevWorkflow(real, v), [], 'control: unedited file passes');
  const A40 = 'a'.repeat(40);
  const permBlock = /^permissions:\n {2}contents: read\n/m;
  const muts = {
    m1: (t) => t.replace(/^on:\n/m, () => 'on:\n  pull_request:\n'),
    m2: (t) => t.replace(/^on:\n(?: +.*\n)+/m, () => 'on: { push: { branches: [develop] } }\n'),
    m3: (t) => t.replace('contents: read', () => 'contents: write'),
    m4: (t) => t.replace(permBlock, (s) => s + '  id-token: write\n'),
    m5: (t) => t.replace(permBlock, () => 'permissions: write-all\n'),
    m6: (t) => t.replace(/^ {4}environment: dev\n/m, (s) => s + '    permissions:\n      contents: write\n'),
    m7: (t) => t.replace('environment: dev', () => 'environment: { name: dev }'),
    m8: (t) => t.replace('environment: dev', () => 'environment: ${{ inputs.env }}'),
    m9: (t) => t.replace(/^ +if: github.*\n/m, () => ''),
    m10: (t) => t.replace('cancel-in-progress: false', () => 'cancel-in-progress: true'),
    m11: (t) => t.replace(/(actions\/checkout)@[0-9a-f]{40}/, (_s, a) => `${a}@v4`),
    m12: (t) => t.replace(/^ {4}steps:\n/m, (s) => `${s}      - uses: "actions/cache@${A40}"\n`),
    m13: (t) => t.replace('node scripts/db/dev-push.mjs', () => 'node scripts/db/dev-push.mjs "${{ secrets.SUPABASE_DEV_DB_URL }}"'),
    m14: (t) => t.replace(/( {8}run: \|\n)( {10}if )/, (_s, a, b) => `${a}          set -x\n${b}`),
    m15: (t) => t.replace(/^ {8}shell: bash\n/m, (s) => s + '        continue-on-error: true\n'),
    m16: (t) => t.replace(`npm install -g pnpm@${v}`, () => 'npm install -g pnpm'),
    m17: (t) => t.replace(/^ {10}node-version: 22\n/m, (s) => s + '          cache: pnpm\n'),
    m18: (t) => t.replace('persist-credentials: false', () => 'persist-credentials: true'),
    m19: (t) => t.replace(/^ {10}SUPABASE_DEV_DB_URL: .*\n/m, (s) => s + '          SUPABASE_ACCESS_TOKEN: x\n'),
    m20: (t) => t.replace(/^ +timeout-minutes: 15\n/m, () => ''),
    m21: (t) => t.replace('node scripts/db/dev-push.mjs', () => 'pnpm supabase db push --db-url "$SUPABASE_DEV_DB_URL"'),
  };
  assert.equal(Object.keys(muts).length, 21);
  for (const [name, f] of Object.entries(muts)) {
    const t = f(real);
    assert.notEqual(t, real, `${name} edit changed the text`);
    assert.ok(checkDevWorkflow(t, v).length > 0, `${name} must be caught`);
  }
});

function pushBody() {
  const lines = realText().split('\n');
  const si = lines.findIndex((l) => l.trim() === '- name: Push migrations to ezdraft-dev');
  assert.ok(si >= 0, 'push step exists');
  const ri = lines.findIndex((l, k) => k > si && l.trim() === 'run: |');
  assert.ok(ri > si, 'run: | in push step');
  const body = [];
  for (let k = ri + 1; k < lines.length; k++) {
    if (lines[k].trim() !== '' && indentOf(lines[k]) <= indentOf(lines[ri])) break;
    body.push(lines[k]);
  }
  const first = body.find((l) => l.trim() !== '');
  const cut = indentOf(first);
  return body.map((l) => l.slice(Math.min(cut, indentOf(l)))).join('\n').replace(/\s+$/, '') + '\n';
}

test('EZD-004c T2 Pushes nothing without the secret, done when (AC-EZD-004c-1, AC-EZD-004c-3)', () => {
  const body = pushBody();
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd004c-'));
  try {
    const script = path.join(tmp, 'step.sh');
    writeFileSync(script, body);
    const stubDir = path.join(tmp, 'bin');
    mkdirSync(stubDir);
    const stub = path.join(stubDir, 'node');
    writeFileSync(stub, '#!/bin/sh\necho "$*" >> "$STUB_LOG"\nexit ${STUB_EXIT:-0}\n');
    chmodSync(stub, 0o755);
    const URL = 'postgresql://postgres.stubref:Pw123abc@example.invalid:5432/postgres';
    let n = 0;
    const run = (envExtra, remove) => {
      const log = path.join(tmp, `log-${n++}`);
      const env = childEnv({ PATH: `${stubDir}:${process.env.PATH}`, STUB_LOG: log, ...envExtra });
      if (remove) delete env.SUPABASE_DEV_DB_URL;
      const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', script], { encoding: 'utf8', env });
      return { r, log };
    };
    const NOTICE = '::notice::SUPABASE_DEV_DB_URL not set: cloud dev migrations wait for Josh';
    for (const [label, extra, remove] of [['(a) absent', {}, true], ['(b) empty', { SUPABASE_DEV_DB_URL: '' }, false]]) {
      const { r, log } = run(extra, remove);
      assert.equal(r.status, 0, label);
      assert.equal(r.stdout.trim(), NOTICE, label);
      assert.equal(existsSync(log), false, `${label}: nothing was called`);
    }
    const c = run({ SUPABASE_DEV_DB_URL: URL }, false);
    assert.equal(c.r.status, 0, '(c) exit');
    assert.equal(readFileSync(c.log, 'utf8'), 'scripts/db/dev-push.mjs\n');
    const out = c.r.stdout + c.r.stderr;
    assert.ok(!out.includes('::notice::'), '(c) no notice');
    assert.ok(!out.includes('Pw123abc'), '(c) secret not in logs');
    const d = run({ SUPABASE_DEV_DB_URL: URL, STUB_EXIT: '1' }, false);
    assert.notEqual(d.r.status, 0, '(d) failure propagates');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("EZD-004c T3 EZD-002's workflow checks pass on it (AC-EZD-004c-1)", () => {
  assert.ok(existsSync(WF), 'supabase-dev.yml exists so EZD-002 T2 is not vacuous');
  const r = spawnSync(
    process.execPath,
    ['--test', '--test-reporter=tap', '--test-name-pattern=^EZD-002 T2', 'scripts/ci/__tests__/ci.test.mjs'],
    { cwd: repo, encoding: 'utf8', env: childEnv() },
  );
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^\s*ok \d+ - EZD-002 T2 Push triggers only where Josh allowed them/m);
  assert.match(r.stdout, /^\s*ok \d+ - EZD-002 T2b /m);
  assert.doesNotMatch(r.stdout, /^\s*not ok/m);
});

function section(text, headingRe, stopRe) {
  const lines = text.split('\n');
  const i = lines.findIndex((l) => headingRe.test(l));
  if (i < 0) return null;
  let end = lines.length;
  for (let k = i + 1; k < lines.length; k++) {
    if (stopRe.test(lines[k])) {
      end = k;
      break;
    }
  }
  return lines.slice(i, end).join('\n');
}
const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

test("EZD-004c T4 Josh's steps and docs (AC-EZD-004c-2)", () => {
  const rbText = read('docs', 'runbook.md');
  const rb = rbText.split('\n');
  const H = '## Supabase cloud projects (EZD-004)';
  assert.equal(rb.filter((l) => l === H).length, 1, 'exactly one runbook heading');
  assert.ok(rb.indexOf('## Vercel and the subdomain (EZD-003)') >= 0, 'EZD-003 section stays');
  assert.ok(rb.indexOf(H) > rb.indexOf('## Vercel and the subdomain (EZD-003)'), 'after the EZD-003 section');
  const sec = section(rbText, /^## Supabase cloud projects \(EZD-004\)$/, /^## (?!Supabase cloud projects)/);
  for (const s of ['ezdraft-dev', 'ezdraft-prod', 'SUPABASE_DEV_DB_URL', '`dev`', 'develop', 'Session pooler', 'Selected branches', 'made-up', 'Run workflow', 'supabase-dev.yml']) {
    assert.ok(sec.includes(s), `runbook section mentions ${s}`);
  }
  assert.ok(!sec.includes('postgresql://'), 'no connection string in runbook');

  const arch = read('docs', 'architecture.md');
  const local = section(arch, /^### Local database$/, /^#{2,3} /);
  assert.ok(local, '### Local database exists');
  assert.ok(local.includes('supabase-dev.yml') && local.includes('SUPABASE_DEV_DB_URL'), 'Local database mentions workflow and secret');
  const envSec = section(arch, /^### Environment variables$/, /^#{2,3} /);
  assert.ok(envSec, '### Environment variables exists');
  assert.ok(
    envSec.split('\n').some((l) => l.trim().startsWith('|') && cells(l)[0] === '`SUPABASE_DEV_DB_URL`' && cells(l)[1] === 'never'),
    'env table row for SUPABASE_DEV_DB_URL with never',
  );
  const lines = arch.split('\n');
  const mc = lines.findIndex((l) => l.trim() === '## Machine checks');
  const ciH = lines.findIndex((l, i) => i > mc && l.trim() === '### CI');
  assert.ok(mc >= 0 && ciH > mc, 'Machine checks and ### CI');
  assert.ok(
    lines.slice(mc, ciH).some((l) => {
      if (!l.trim().startsWith('|')) return false;
      const c = cells(l);
      return c.length === 4 && c[2].replace(/`/g, '') === 'scripts/db/__tests__/supabase-dev.test.mjs' && c[3] === 'EZD-004c';
    }),
    'Machine checks row for EZD-004c before ### CI',
  );
  assert.ok(!read('.env.example').includes('SUPABASE_DEV_DB_URL'), '.env.example unchanged');
  const chk = spawnSync(process.execPath, [path.join(repo, 'scripts', 'conventions', 'check.mjs'), repo], { encoding: 'utf8', env: childEnv() });
  assert.equal(chk.status, 0, chk.stdout + chk.stderr);
});

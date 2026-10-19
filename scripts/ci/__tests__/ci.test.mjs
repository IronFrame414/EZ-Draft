// EZD-002 T1-T6 (vault/plans/EZD-002.md sections 3 and 4). Offline; Node built-ins only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const workflowsDir = path.join(repo, '.github', 'workflows');

const readLines = (file) => readFileSync(file, 'utf8').split(/\r?\n/);
const trimmed = (file) => readLines(file).map((l) => l.trim());
const indentOf = (l) => l.length - l.trimStart().length;
const isBlankOrComment = (l) => l.trim() === '' || l.trim().startsWith('#');
const stripQuotes = (s) => s.trim().replace(/^(['"])(.*)\1$/, '$2');
const stripComment = (s) => s.replace(/\s+#.*$/, '');

// ---------- workflow checker (line based, no YAML package) ----------

// Lines nested under the line at index i (indent greater than line i's), blank/comment lines skipped.
function children(lines, i) {
  const base = indentOf(lines[i]);
  const out = [];
  for (let j = i + 1; j < lines.length; j++) {
    if (isBlankOrComment(lines[j])) continue;
    if (indentOf(lines[j]) <= base) break;
    out.push({ idx: j, text: lines[j] });
  }
  return out;
}

// Triggers of a file: { name -> { form: 'block'|'scalar', lineIdx, rest } }; `brace` is true for `on: { ... }`.
function readTriggers(lines) {
  const triggers = {};
  let brace = false;
  const onIdx = lines.findIndex((l) => /^["']?on["']?\s*:/.test(l));
  if (onIdx < 0) return { triggers, brace };
  const rest = stripComment(lines[onIdx].replace(/^["']?on["']?\s*:/, '')).trim();
  if (rest.startsWith('{')) return { triggers, brace: true };
  if (rest) {
    const names = rest.replace(/^\[|\]$/g, '').split(',').map((s) => stripQuotes(s)).filter(Boolean);
    for (const n of names) triggers[n] = { form: 'scalar', lineIdx: onIdx };
    return { triggers, brace };
  }
  const kids = children(lines, onIdx);
  if (!kids.length) return { triggers, brace };
  const base = indentOf(kids[0].text);
  for (const k of kids) {
    if (indentOf(k.text) !== base) continue;
    const m = /^\s*["']?([A-Za-z_][\w-]*)["']?\s*:(.*)$/.exec(k.text);
    if (m) triggers[m[1]] = { form: 'block', lineIdx: k.idx, rest: stripComment(m[2]).trim() };
  }
  return { triggers, brace };
}

// Values of a key under a trigger: flow list, one scalar, or "- item" lines. Returns null if the key is absent.
function readKey(lines, triggerIdx, key) {
  const kids = children(lines, triggerIdx);
  const at = kids.findIndex((k) => new RegExp(`^\\s*${key}\\s*:`).test(k.text));
  if (at < 0) return null;
  const rest = stripComment(kids[at].text.replace(new RegExp(`^\\s*${key}\\s*:`), '')).trim();
  if (rest) {
    return rest.replace(/^\[|\]$/g, '').split(',').map((s) => stripQuotes(s)).filter(Boolean);
  }
  const keyIndent = indentOf(kids[at].text);
  const vals = [];
  for (let j = at + 1; j < kids.length; j++) {
    if (indentOf(kids[j].text) <= keyIndent) break;
    const m = /^\s*-\s*(.*)$/.exec(stripComment(kids[j].text));
    if (m) vals.push(stripQuotes(m[1]));
  }
  return vals;
}

// { values: [string], brace: boolean } for every `environment:` key.
function environmentsOf(lines) {
  const values = [];
  let brace = false;
  lines.forEach((l, i) => {
    const m = /^\s*environment\s*:(.*)$/.exec(l);
    if (!m || l.trim().startsWith('#')) return;
    const rest = stripComment(m[1]).trim();
    if (rest.startsWith('{')) { brace = true; return; }
    if (rest) { values.push(stripQuotes(rest)); return; }
    for (const k of children(lines, i)) {
      const n = /^\s*name\s*:(.*)$/.exec(k.text);
      if (n) values.push(stripQuotes(stripComment(n[1])));
    }
  });
  return { values, brace };
}

// Names read through `secrets.NAME` / `secrets["NAME"]` (upper-cased), plus the occurrences of the
// word `secrets` that are not followed by one of those two forms.
function secretsOf(lines) {
  const names = new Set();
  const bad = [];
  lines.forEach((l, i) => {
    if (l.trim().startsWith('#')) return;
    const text = l; // only full-line comments are skipped; a ' #' inside a line hides nothing
    for (const m of text.matchAll(/\bsecrets\b/gi)) {
      const after = text.slice(m.index + m[0].length);
      const dot = /^\.([A-Za-z0-9_]+)/.exec(after);
      const br = /^\[\s*(["'])([A-Za-z0-9_]+)\1\s*\]/.exec(after);
      if (dot) names.add(dot[1].toUpperCase());
      else if (br) names.add(br[2].toUpperCase());
      else bad.push(`line ${i + 1}: ${l.trim()}`);
    }
  });
  return { names: [...names].sort(), bad };
}

// Problems of rule (i): any actions/cache use, or a `cache:` key in an actions/setup-node step.
function cacheUses(lines) {
  const found = [];
  lines.forEach((l, i) => {
    if (l.trim().startsWith('#')) return;
    const m = /\buses\s*:\s*("[^"]*"|'[^']*'|[^\s,}]+)/.exec(l);
    if (!m) return;
    const value = stripQuotes(m[1]);
    if (/^actions\/cache(\/|@|$)/.test(value)) found.push(`${value} at line ${i + 1}`);
    if (!/^actions\/setup-node(@|$)/.test(value)) return;
    let start = i;
    if (!/^\s*-\s/.test(l)) {
      const ind = indentOf(l);
      while (start > 0 && !(/^\s*-\s/.test(lines[start]) && indentOf(lines[start]) < ind)) start--;
    }
    const stepIndent = indentOf(lines[start]);
    for (let j = start + 1; j < lines.length; j++) {
      if (isBlankOrComment(lines[j])) continue;
      if (indentOf(lines[j]) <= stepIndent) break;
      if (/^\s*cache\s*:/.test(lines[j])) found.push(`setup-node cache at line ${j + 1}`);
    }
  });
  return found;
}

const EXPECTED_SECRETS = {
  'release.yml': ['VERCEL_TOKEN', 'VERCEL_PROJECT_ID', 'VERCEL_TEAM_ID', 'TENANT1_OWNER_EMAIL',
    'BACKUP_SOURCE_DB_URL', 'BACKUP_S3_ENDPOINT', 'BACKUP_S3_REGION', 'BACKUP_S3_BUCKET',
    'RELEASE_S3_ACCESS_KEY_ID', 'RELEASE_S3_SECRET_ACCESS_KEY'],
  'backup-files.yml': ['BACKUP_SOURCE_DB_URL', 'BACKUP_SOURCE_SUPABASE_URL', 'BACKUP_SOURCE_SECRET_KEY',
    'BACKUP_S3_ENDPOINT', 'BACKUP_S3_REGION', 'BACKUP_S3_BUCKET', 'BACKUP_S3_ACCESS_KEY_ID',
    'BACKUP_S3_SECRET_ACCESS_KEY'],
  'backup-db.yml': ['BACKUP_SOURCE_DB_URL', 'BACKUP_S3_ENDPOINT', 'BACKUP_S3_REGION', 'BACKUP_S3_BUCKET',
    'BACKUP_S3_ACCESS_KEY_ID', 'BACKUP_S3_SECRET_ACCESS_KEY'],
  'supabase-dev.yml': ['SUPABASE_DEV_DB_URL'],
};
const sortedCopy = (a) => [...a].sort();

// The one checker T2 runs on every real workflow file and T2b runs on in-memory samples.
// Returns [{ rule: 'a'..'i', msg }].
function checkWorkflow(fileName, text) {
  const lines = text.split(/\r?\n/);
  const problems = [];
  const add = (rule, msg) => problems.push({ rule, msg });

  // (a)-(e) triggers
  const { triggers, brace } = readTriggers(lines);
  if (brace) add('a', 'brace-form on: { ... }');
  for (const bad of ['pull_request_target', 'workflow_run']) {
    if (bad in triggers) add('a', `${bad} trigger`);
  }
  if ('push' in triggers) {
    const t = triggers.push;
    if (!['release.yml', 'supabase-dev.yml'].includes(fileName)) add('b', 'push trigger not allowed');
    if (t.form !== 'block' || t.rest !== '') add('c', 'push must use the block form');
    if (readKey(lines, t.lineIdx, 'branches-ignore') !== null) add('c', 'branches-ignore');
    const branches = readKey(lines, t.lineIdx, 'branches');
    if (branches === null) add('c', 'push has no branches key');
    if (fileName === 'release.yml') {
      if (JSON.stringify(branches) !== JSON.stringify(['main'])) add('d', 'push branches must be exactly main');
      for (const k of ['tags', 'tags-ignore', 'paths', 'paths-ignore']) {
        if (readKey(lines, t.lineIdx, k) !== null) add('d', `push has ${k}`);
      }
    }
    if (fileName === 'supabase-dev.yml') {
      if (JSON.stringify(branches) !== JSON.stringify(['develop'])) add('e', 'push branches must be exactly develop');
      if (JSON.stringify(readKey(lines, t.lineIdx, 'paths')) !== JSON.stringify(['supabase/migrations/**'])) {
        add('e', 'push paths must be exactly supabase/migrations/**');
      }
    }
  }

  // (g) environments
  const envs = environmentsOf(lines);
  if (envs.brace) add('g', 'brace-form environment: { ... }');
  for (const env of envs.values) {
    const e = env.toLowerCase();
    if (env.includes('${{')) add('g', 'environment chosen by an expression');
    if (e === 'production') add('g', 'production environment');
    if (e === 'release' && !['release.yml', 'backup-files.yml', 'backup-db.yml'].includes(fileName)) {
      add('g', 'release environment not allowed here');
    }
    if (e === 'dev' && fileName !== 'supabase-dev.yml') add('g', 'dev environment not allowed here');
  }

  // (h) secrets
  const secrets = secretsOf(lines);
  for (const b of secrets.bad) add('h', `unsupported use of secrets, ${b}`);
  const want = sortedCopy((EXPECTED_SECRETS[fileName] ?? []).map((s) => s.toUpperCase()));
  if (JSON.stringify(secrets.names) !== JSON.stringify(want)) {
    add('h', `secret names [${secrets.names}] differ from [${want}]`);
  }

  // (i) caches
  if (['release.yml', 'backup-files.yml', 'backup-db.yml'].includes(fileName)) {
    for (const c of cacheUses(lines)) add('i', c);
  }
  return problems;
}

const show = (problems) => problems.map((p) => `(${p.rule}) ${p.msg}`);

function workflowFiles() {
  if (!existsSync(workflowsDir)) return [];
  return readdirSync(workflowsDir).filter((f) => /\.ya?ml$/.test(f)).sort();
}

// ---------- T1 ----------
test('EZD-002 T1 Workflow runs the gate (AC-EZD-002-1)', () => {
  const lines = trimmed(path.join(workflowsDir, 'ci.yml'));
  assert.ok(lines.includes('pull_request:'), 'pull_request: block');
  const pr = lines.indexOf('pull_request:');
  assert.ok(/^branches:\s*\[\s*main\s*\]$/.test(lines[pr + 1]), 'pull_request branches line is [main]');
  assert.ok(lines.includes('workflow_dispatch:'), 'workflow_dispatch: line');
  const jobs = lines.indexOf('jobs:');
  assert.ok(jobs >= 0, 'jobs: line');
  assert.ok(lines.indexOf('gate:', jobs) > jobs, 'job key gate: under jobs:');
  const next = lines.indexOf('run: node vault/tools/next_ticket.mjs --check');
  const gate = lines.indexOf('run: node scripts/gate.mjs .');
  assert.ok(next >= 0, 'next_ticket --check step');
  assert.ok(gate > next, 'gate step comes after the ledger check step');
  assert.ok(lines.some((l) => /^node-version:\s*["']?22["']?$/.test(l)), 'node-version: 22');
});


// ---------- T2 ----------
test('EZD-002 T2 Push triggers only where Josh allowed them (AC-EZD-002-1)', () => {
  const files = workflowFiles();
  assert.ok(files.includes('ci.yml'), 'ci.yml exists');
  for (const f of files) {
    const problems = checkWorkflow(f, readFileSync(path.join(workflowsDir, f), 'utf8'));
    assert.deepEqual(show(problems), [], `${f}: workflow rules`);
  }
});

// ---------- T2b ----------
test('EZD-002 T2b T2 rules catch the bypasses (AC-EZD-002-1)', () => {
  const on = (body) => `on:\n  workflow_dispatch:\njobs:\n  a:\n    runs-on: ubuntu-latest\n${body}`;
  const samples = [
    ['s1', 'x.yml', 'on: { push: { branches: [main] } }\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n', 'a'],
    ['s2', 'x.yml', on('    steps:\n      - run: echo ok\n        env:\n          ALL: ${{ toJSON(secrets) }}\n'), 'h'],
    ['s3', 'x.yml', on('    uses: ./.github/workflows/other.yml\n    secrets: inherit\n'), 'h'],
    ['s4', 'x.yml', on('    steps:\n      - run: echo ok\n        env:\n          K: ${{ secrets[matrix.key] }}\n'), 'h'],
    ['s5', 'ci.yml', on('    steps:\n      - run: echo ok\n        env:\n          K: ${{ secrets["VERCEL_TOKEN"] }}\n'), 'h'],
    ['s6', 'release.yml', on("    steps:\n      - run: echo ok\n        env:\n          K: ${{ secrets['RESEND_API_KEY'] }}\n"), 'h'],
    ['s7', 'x.yml', on('    environment: { name: release }\n    steps:\n      - run: echo ok\n'), 'g'],
    ['s8', 'release.yml', on('    steps:\n      - uses: actions/cache/restore@v4\n'), 'i'],
    ['s9', 'release.yml', on('    steps:\n      - uses: actions/cache/save@v4\n'), 'i'],
    ['s10', 'release.yml', on('    steps:\n      - uses: "actions/cache@v4"\n'), 'i'],
    ['s11', 'backup-db.yml', on("    steps:\n      - uses: 'actions/setup-node@v4'\n        with:\n          cache: pnpm\n"), 'i'],
  ];
  for (const [id, file, text, rule] of samples) {
    const problems = checkWorkflow(file, text);
    assert.ok(problems.length > 0, `${id}: at least one problem`);
    assert.ok(problems.some((p) => p.rule === rule), `${id}: caught by rule (${rule}), got ${show(problems)}`);
  }
  // s5 and s6: the name is counted, not just flagged
  for (const [i, name] of [[4, 'VERCEL_TOKEN'], [5, 'RESEND_API_KEY']]) {
    const ps = checkWorkflow(samples[i][1], samples[i][2]);
    assert.ok(
      ps.some((p) => p.rule === 'h' && p.msg.startsWith('secret names') && p.msg.includes(name)),
      `${samples[i][0]}: ${name} counted against the file's list: ${show(ps)}`,
    );
    assert.ok(!ps.some((p) => p.msg.startsWith('unsupported use of secrets')), `${samples[i][0]}: bracket form is not flagged as unsupported`);
  }
  // c0: clean control
  const c0 = on('    steps:\n      - run: echo ok\n');
  assert.deepEqual(show(checkWorkflow('x.yml', c0)), [], 'c0: clean text has no problem');
});

// ---------- T3 ----------
const FIXTURE_SCRIPTS = {
  typecheck: 'pnpm -r --if-present --filter "!./spikes/**" run typecheck',
  lint: 'node scripts/conventions/check.mjs && pnpm -r --if-present --filter "!./spikes/**" run lint',
  test: 'node --test --test-concurrency=4 "scripts/**/*.test.mjs" && pnpm -r --if-present --filter "!./spikes/**" run test',
  build: 'pnpm -r --if-present --filter "!./spikes/**" run build',
};

function childEnv(tmp) {
  const env = { ...process.env };
  delete env.EZD_TEST_GREP;
  delete env.EZD_PHASE;
  delete env.NODE_TEST_CONTEXT; // set by the outer node --test; a nested node --test must start clean
  if (tmp) { env.TMP = tmp; env.TEMP = tmp; env.TMPDIR = tmp; }
  return env;
}

function writeProbe(fixture, failing = []) {
  const ok = 'node -e "process.exit(0)"';
  const bad = 'node -e "process.exit(1)"';
  const scripts = {};
  for (const n of ['typecheck', 'lint', 'test', 'build']) scripts[n] = failing.includes(n) ? bad : ok;
  writeFileSync(path.join(fixture, 'packages', 'probe', 'package.json'),
    JSON.stringify({ name: '@ezdraft/probe', version: '0.0.0', private: true, scripts }, null, 2));
}

function runGate(fixture) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd002-lock-'));
  try {
    const r = spawnSync('node', [path.join(repo, 'scripts', 'gate.mjs'), fixture], {
      encoding: 'utf8', env: childEnv(tmp), maxBuffer: 64 * 1024 * 1024,
    });
    return { status: r.status, out: r.stdout || '', err: r.stderr || '' };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const resultLine = (out, name, result) =>
  new RegExp(`^${name.replace(':', '\\:')}\\s+${result}$`, 'm').test(out);

test('EZD-002 T3 Gate fails on a failing check (AC-EZD-002-2) done when', { timeout: 180000 }, () => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), 'ezd002-fixture-'));
  try {
    writeFileSync(path.join(fixture, 'package.json'),
      JSON.stringify({ name: 'ezd002-fixture', version: '0.0.0', private: true, scripts: FIXTURE_SCRIPTS }, null, 2));
    writeFileSync(path.join(fixture, 'pnpm-workspace.yaml'),
      'packages:\n  - app\n  - "packages/*"\n  - worker\n  - "spikes/*"\n');
    mkdirSync(path.join(fixture, 'scripts', 'conventions'), { recursive: true });
    writeFileSync(path.join(fixture, 'scripts', 'conventions', 'check.mjs'), 'process.exit(0);\n');
    writeFileSync(path.join(fixture, 'scripts', 'ok.test.mjs'),
      "import { test } from 'node:test';\ntest('ok', () => {});\n");
    mkdirSync(path.join(fixture, 'packages', 'probe'), { recursive: true });
    writeProbe(fixture);

    const inst = spawnSync('pnpm', ['install', '--no-frozen-lockfile'], {
      cwd: fixture, encoding: 'utf8', env: childEnv(), maxBuffer: 64 * 1024 * 1024,
    });
    assert.equal(inst.status, 0, `fixture install failed: ${inst.stdout}${inst.stderr}`);
    assert.ok(existsSync(path.join(fixture, 'pnpm-lock.yaml')), 'fixture has pnpm-lock.yaml');
    assert.ok(existsSync(path.join(fixture, 'node_modules')), 'fixture has node_modules');

    const lastLine = (out) => out.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() !== '').pop();
    const required = ['typecheck', 'lint', 'test', 'build'];
    const expectOthersPass = (out, failed) => {
      for (const n of required.filter((r) => r !== failed)) {
        assert.ok(resultLine(out, n, 'pass'), `${n} still shows pass when ${failed} fails:\n${out}`);
      }
    };

    // green case
    const green = runGate(fixture);
    assert.equal(green.status, 0, `green case exit:\n${green.out}${green.err}`);
    for (const n of required) assert.ok(resultLine(green.out, n, 'pass'), `${n} pass:\n${green.out}`);
    assert.ok(resultLine(green.out, 'test:e2e', 'not yet'), 'test:e2e not yet');
    assert.ok(resultLine(green.out, 'perf', 'not yet'), 'perf not yet');
    assert.ok(green.out.includes('GATE PASS'), 'GATE PASS printed');

    // (test-pkg)
    writeProbe(fixture, ['test']);
    let r = runGate(fixture);
    assert.equal(r.status, 1, 'test-pkg exit code');
    assert.ok(resultLine(r.out, 'test', 'FAIL'), `test FAIL:\n${r.out}`);
    assert.equal(lastLine(r.out), 'GATE FAIL: test', 'last non-empty stdout line');
    expectOthersPass(r.out, 'test');

    // (test-root)
    writeProbe(fixture);
    const bad = path.join(fixture, 'scripts', 'bad.test.mjs');
    writeFileSync(bad, "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\ntest('bad', () => { assert.equal(1, 2); });\n");
    r = runGate(fixture);
    assert.equal(r.status, 1, 'test-root exit code');
    assert.ok(resultLine(r.out, 'test', 'FAIL'), `test FAIL (root):\n${r.out}`);
    expectOthersPass(r.out, 'test');
    rmSync(bad);

    // (lint)
    writeProbe(fixture, ['lint']);
    r = runGate(fixture);
    assert.equal(r.status, 1, 'lint exit code');
    assert.ok(resultLine(r.out, 'lint', 'FAIL'), `lint FAIL:\n${r.out}`);
    expectOthersPass(r.out, 'lint');

    // (typecheck)
    writeProbe(fixture, ['typecheck']);
    r = runGate(fixture);
    assert.equal(r.status, 1, 'typecheck exit code');
    assert.ok(resultLine(r.out, 'typecheck', 'FAIL'), `typecheck FAIL:\n${r.out}`);
    expectOthersPass(r.out, 'typecheck');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

// ---------- T4 ----------
test('EZD-002 T4 A failing Vitest test exits non-zero (AC-EZD-002-2)', { timeout: 180000 }, () => {
  for (const p of ['app', path.join('packages', 'geometry')]) {
    const pkg = JSON.parse(readFileSync(path.join(repo, p, 'package.json'), 'utf8'));
    assert.ok(pkg.scripts.test.startsWith('vitest run'), `${p} test script starts with vitest run`);
  }
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd002-vitest-'));
  try {
    writeFileSync(path.join(tmp, 'probe.test.ts'),
      "describe('EZD-002 probe', () => {\n  it('EZD-002 probe fails', () => { throw new Error('EZD-002 probe failure'); });\n});\n");
    writeFileSync(path.join(tmp, 'vitest.config.mjs'),
      "export default { test: { globals: true, include: ['probe.test.ts'], environment: 'node' } };\n");
    const r = spawnSync('pnpm', ['--filter', '@ezdraft/geometry', 'exec', 'vitest', 'run',
      '--root', tmp, '--config', path.join(tmp, 'vitest.config.mjs')], {
      cwd: repo, encoding: 'utf8', env: childEnv(), maxBuffer: 64 * 1024 * 1024,
    });
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    assert.notEqual(r.status, 0, `vitest exit code must not be 0:\n${out}`);
    assert.ok(out.includes('probe.test.ts'), `output names probe.test.ts:\n${out}`);
    assert.ok(
      out.includes('EZD-002 probe failure') || out.includes('EZD-002 probe fails'),
      `a failing test actually ran:\n${out}`,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------- T5 ----------
test('EZD-002 T5 pnpm pin honored (AC-EZD-002-2)', () => {
  const pin = JSON.parse(readFileSync(path.join(repo, 'package.json'), 'utf8')).packageManager;
  assert.ok(pin.startsWith('pnpm@'), 'packageManager is pnpm@<version>');
  const r = spawnSync('pnpm', ['--version'], { cwd: repo, encoding: 'utf8', env: childEnv() });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), pin.slice('pnpm@'.length));
});

// ---------- T6 ----------
test('EZD-002 T6 CI documented', () => {
  const lines = readLines(path.join(repo, 'docs', 'architecture.md'));
  const mc = lines.findIndex((l) => l.trim() === '## Machine checks');
  assert.ok(mc >= 0, '## Machine checks heading');
  let end = lines.length;
  for (let i = mc + 1; i < lines.length; i++) if (/^## /.test(lines[i])) { end = i; break; }
  const ci = lines.findIndex((l, i) => i > mc && i < end && l.trim() === '### CI');
  assert.ok(ci > mc, '### CI heading inside ## Machine checks');
  let ciEnd = end;
  for (let i = ci + 1; i < end; i++) if (/^#{2,3} /.test(lines[i])) { ciEnd = i; break; }
  const section = lines.slice(ci, ciEnd).join('\n');
  for (const s of ['.github/workflows/ci.yml', 'scripts/gate.mjs', 'next_ticket.mjs --check', 'workflow_dispatch', 'EZD-003']) {
    assert.ok(section.includes(s), `### CI mentions ${s}`);
  }
  const row = lines.slice(mc, end).some((l) => {
    const cells = l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    return l.trim().startsWith('|') && cells.length >= 4 && cells[cells.length - 1] === 'EZD-002';
  });
  assert.ok(row, 'Machine checks table row whose last cell is EZD-002');
  const c = spawnSync('node', [path.join(repo, 'scripts', 'conventions', 'check.mjs'), repo], {
    encoding: 'utf8', env: childEnv(),
  });
  assert.equal(c.status, 0, `conventions check:\n${c.stdout}${c.stderr}`);
});

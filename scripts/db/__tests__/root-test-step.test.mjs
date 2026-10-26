// EZD-187 T1-T6 (vault/plans/EZD-187.md sections 1, 3 and 4). T7 (the script text) is in
// scripts/db/__tests__/db.test.mjs, EZD-004a T14.
// node:test, Node 22 built-ins only. Each case builds a fixture workspace in a fresh temporary folder and
// runs the fixture's `pnpm run test`. The fixture's test script is the repo root's scripts.test, read at run
// time. The fixture's db:up, app, geometry and spike scripts are rec.mjs: it appends one line to FIX_LOG and
// exits with the code the case sets. The fixture's root node:test file appends `root` to FIX_LOG and throws
// when the case sets FIX_EXIT_ROOT=1. Expected values come from plan section 1 (the script contract S) and
// section 4 (the case table), never from a run. Nothing depends on where the repo is checked out (L-003).
import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const rootPackage = JSON.parse(readFileSync(path.join(repo, 'package.json'), 'utf8'));

// The grep the Test scope rule builds for one ticket of phase 1 plus the smoke tag (architecture.md
// `### Test scope (Q-0006)`). T5 passes it through and checks each fixture script receives it unchanged.
const GREP = '(?:EZD-(?:999)(?![0-9a-z]))|@smoke';

const REC_SOURCE =
  [
    "import { appendFileSync } from 'node:fs';",
    'const name = process.argv[2];',
    "const KEY = { 'db:up': 'DB_UP', app: 'APP', geometry: 'GEOMETRY', spike: 'SPIKE' }[name];",
    "appendFileSync(process.env.FIX_LOG, `${name} ${process.env.EZD_TEST_SCOPE ?? '-'} ${process.env.EZD_PHASE ?? '-'} ${process.env.EZD_TEST_GREP ?? '-'}\\n`);",
    "process.exit(Number(process.env['FIX_EXIT_' + KEY] ?? 0));",
  ].join('\n') + '\n';

const ROOT_TEST_SOURCE =
  [
    "import { test } from 'node:test';",
    "import { appendFileSync } from 'node:fs';",
    "test('fixture root case', () => {",
    "  appendFileSync(process.env.FIX_LOG, 'root\\n');",
    "  if (process.env.FIX_EXIT_ROOT === '1') throw new Error('fixture root failure');",
    '});',
  ].join('\n') + '\n';

const folders = [];
after(() => {
  for (const dir of folders) rmSync(dir, { recursive: true, force: true });
});

function writeFile(dir, rel, text) {
  const file = path.join(dir, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function packageJson(name, scripts) {
  return JSON.stringify({ name, private: true, scripts }, null, 2) + '\n';
}

function makeFixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd-187-'));
  folders.push(dir);
  writeFile(
    dir,
    'package.json',
    JSON.stringify(
      {
        name: 'ezd-187-fixture',
        private: true,
        packageManager: rootPackage.packageManager,
        scripts: { test: rootPackage.scripts.test, 'db:up': 'node rec.mjs db:up' },
      },
      null,
      2,
    ) + '\n',
  );
  writeFile(
    dir,
    'pnpm-workspace.yaml',
    'packages:\n  - app\n  - packages/*\n  - spikes/*\nworkspaceConcurrency: 1\n',
  );
  writeFile(dir, 'rec.mjs', REC_SOURCE);
  writeFile(dir, 'app/package.json', packageJson('@fx/app', { test: 'node ../rec.mjs app' }));
  writeFile(
    dir,
    'packages/geometry/package.json',
    packageJson('@fx/geometry', { test: 'node ../../rec.mjs geometry' }),
  );
  writeFile(dir, 'spikes/s/package.json', packageJson('@fx/spike', { test: 'node ../../rec.mjs spike' }));
  writeFile(dir, 'app/test-harness/net-guard/preload.mjs', '');
  writeFile(dir, 'scripts/x/root.test.mjs', ROOT_TEST_SOURCE);
  return dir;
}

// Runs the fixture's `pnpm run test` with the outer run's scope variables, npm_* settings and node:test
// context removed, so the nested run sees only what the case sets.
function runRootTest(caseEnv = {}) {
  const dir = makeFixture();
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      /^npm_/i.test(key) ||
      key === 'PNPM_SCRIPT_SRC_DIR' ||
      key === 'NODE_TEST_CONTEXT' ||
      key === 'EZD_TEST_SCOPE' ||
      key === 'EZD_PHASE' ||
      key === 'EZD_TEST_GREP' ||
      key.startsWith('FIX_')
    ) {
      delete env[key];
    }
  }
  const log = path.join(dir, 'log');
  Object.assign(env, { CI: '1', FIX_LOG: log }, caseEnv);
  const r = spawnSync('pnpm', ['run', 'test'], { cwd: dir, env, encoding: 'utf8', timeout: 120000 });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  assert.notEqual(r.status, null, `pnpm run test timed out or was killed (${r.signal})\n${output}`);
  const lines = existsSync(log) ? readFileSync(log, 'utf8').split('\n') : [];
  if (lines.at(-1) === '') lines.pop();
  return { status: r.status, output, lines };
}

const isSpike = (line) => line.split(' ')[0] === 'spike';

// Every part ran: db:up first, root node:test second (before any package line), then app and geometry
// in either order. `scope` is the three values each fixture script logs after its name.
function assertRanEverything(lines, scope, output) {
  assert.equal(lines[0], `db:up ${scope}`, `db:up runs first (D2): ${lines.join(' | ')}\n${output}`);
  assert.equal(lines[1], 'root', `root node:test runs second, before any package (D2): ${lines.join(' | ')}\n${output}`);
  assert.deepEqual(
    [...lines.slice(2)].sort(),
    [`app ${scope}`, `geometry ${scope}`].sort(),
    `both package suites ran (D5, D6): ${lines.join(' | ')}\n${output}`,
  );
  assert.ok(!lines.some(isSpike), `spikes are filtered out (D6): ${lines.join(' | ')}`);
}

describe('EZD-187 root test step', () => {
  test('EZD-187 T1 root node:test fails: the package suites still run and the test step fails (AC-EZD-187-1)', () => {
    const r = runRootTest({ FIX_EXIT_ROOT: '1' });
    assert.notEqual(r.status, 0, `the step must fail when the root node:test file fails\n${r.output}`);
    assertRanEverything(r.lines, '- - -', r.output);
  });

  test('EZD-187 T2 package suite fails: the test step fails (AC-EZD-187-2)', () => {
    const r = runRootTest({ FIX_EXIT_APP: '1' });
    assert.notEqual(r.status, 0, `the step must fail when a package suite fails\n${r.output}`);
    assertRanEverything(r.lines, '- - -', r.output);
  });

  test('EZD-187 T3 db:up fails: neither part runs and the test step fails (AC-EZD-187-3)', () => {
    const r = runRootTest({ FIX_EXIT_DB_UP: '1' });
    assert.notEqual(r.status, 0, `the step must fail when db:up fails\n${r.output}`);
    assert.deepEqual(r.lines, ['db:up - - -'], `only db:up runs (D3): ${r.lines.join(' | ')}\n${r.output}`);
  });

  test('EZD-187 T4 all parts pass (control): the step passes and every part ran (AC-EZD-187-1, AC-EZD-187-2)', () => {
    const r = runRootTest({});
    assert.equal(r.status, 0, `the step must pass when every part passes\n${r.output}`);
    assertRanEverything(r.lines, '- - -', r.output);
  });

  test('EZD-187 T5 scope variables reach the fan-out and root node:test is unfiltered (AC-EZD-187-1)', () => {
    const r = runRootTest({ EZD_TEST_SCOPE: 'phase', EZD_PHASE: '1', EZD_TEST_GREP: GREP });
    assert.equal(r.status, 0, `the phase-scoped step must pass when every part passes\n${r.output}`);
    assertRanEverything(r.lines, `phase 1 ${GREP}`, r.output);
  });

  test('EZD-187 T6 a failing app suite does not stop geometry: both packages run and the step fails (AC-EZD-187-2)', () => {
    const r = runRootTest({ FIX_EXIT_APP: '1', FIX_EXIT_GEOMETRY: '1' });
    assert.notEqual(r.status, 0, `the step must fail when two package suites fail\n${r.output}`);
    assertRanEverything(r.lines, '- - -', r.output);
  });
});

// EZD-179 · Vitest configs load as ESM (vault/plans/EZD-179.md sections 3-4; decisions D3-D14 in section 1).
// Sources: Q-0314 (the configLoader warning); Q-0268 and CLAUDE.md rule 17 (no warning from our configuration is parked);
// probes P1-P6 in section 2 of the plan. The warning must be removed by the cause (the .ts config files loaded as
// CommonJS), never silenced (D5, D9, D10, T7).
// Run by the root `node --test "scripts/**/*.test.mjs"`. Each case runs a real Vitest or tsc command through pnpm.
// Tests match exit codes, paths, file sets and the warning text, not other wording.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, realpathSync, existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const realRoot = realpathSync(root);
const appDir = path.join(root, 'app');

// D10: the two lines of Vite's warning (P1 output). Neither may appear in stdout or stderr.
const WARNING_TEXTS = ['ESM syntax in a file loaded as CommonJS', "configLoader: 'native'"];

/** D9: a shell value must not hide the warning or narrow the run. */
function childEnv() {
  const env = { ...process.env };
  delete env.EZD_TEST_GREP;
  delete env.VITE_CONFIG_NATIVE_IGNORE_WARNING;
  return env;
}

function run(cmd, args, cwd) {
  return spawnSync(cmd, args, { encoding: 'utf8', env: childEnv(), cwd, timeout: 300_000 });
}

function warningsIn(result) {
  const text = `${result.stdout}\n${result.stderr}`;
  return WARNING_TEXTS.filter((w) => text.includes(w));
}

/** The JSON array `vitest list --filesOnly --json` prints on stdout, as file paths. */
function listedFiles(result) {
  const start = result.stdout.search(/^\[/m);
  assert.ok(start >= 0, `vitest list prints a JSON array, got ${JSON.stringify(result.stdout.slice(0, 200))}`);
  return JSON.parse(result.stdout.slice(start)).map((e) => (typeof e === 'string' ? e : e.file));
}

/** D12 / D13: a path relative to the real repo root, `/`-joined. */
function fromRealRoot(file) {
  const real = existsSync(file) ? realpathSync(file) : file;
  return path.relative(realRoot, real).split(path.sep).join('/');
}

/** D13: recursive walk, withFileTypes, symlinks not followed, node_modules skipped. */
function walk(dir, keep, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, keep, out);
    else if (entry.isFile() && keep(entry.name)) out.push(p);
  }
  return out;
}

// The commands of plan section 3, each run once and shared by the cases that read it.
let appListRun;
function appList() {
  appListRun ??= run('pnpm', ['--filter', '@ezdraft/app', 'exec', 'vitest', 'list', '--filesOnly', '--json'], root);
  return appListRun;
}
let rootListRun;
function rootList() {
  rootListRun ??= run('pnpm', ['exec', 'vitest', 'list', '--filesOnly', '--json'], root);
  return rootListRun;
}
let probeRun;
function probe() {
  probeRun ??= run(
    'pnpm',
    [
      '--filter',
      '@ezdraft/app',
      'exec',
      'vitest',
      'run',
      '--config',
      'test-harness/net-guard/probe.vitest.config.mts',
      'test-harness/net-guard/probes/loopback.probe.ts',
    ],
    root,
  );
  return probeRun;
}

/** D11 / T4: the app test files the app include reaches, `app/`-relative, from a walk that mirrors the include. */
function appTestWalk() {
  const realApp = path.join(realRoot, 'app');
  const src = walk(path.join(realApp, 'src'), (n) => n.endsWith('.test.ts') || n.endsWith('.test.tsx'));
  const harness = walk(path.join(realApp, 'test-harness'), (n) => n.endsWith('.test.ts'));
  return [...src, ...harness].map((p) => path.relative(realApp, p).split(path.sep).join('/')).sort();
}

describe('EZD-179 Vitest configs load as ESM', () => {
  // ---------- T1 ----------
  test('EZD-179 T1: an app Vitest run prints no ESM-in-CommonJS warning and lists the app tests', () => {
    const r = appList();
    assert.equal(r.status, 0, `vitest list in app failed: ${r.stderr}`);
    assert.deepEqual(warningsIn(r), [], `the app run must print no configLoader warning`);
    assert.ok(listedFiles(r).length > 0, 'the app run lists test files');
  });

  // ---------- T2 ----------
  test('EZD-179 T2: a root Vitest run prints no warning and reaches the app and geometry projects', () => {
    const r = rootList();
    assert.equal(r.status, 0, `vitest list at the root failed: ${r.stderr}`);
    assert.deepEqual(warningsIn(r), [], 'the root run must print no configLoader warning');
    const listed = listedFiles(r).map(fromRealRoot).sort();
    const geometry = walk(path.join(realRoot, 'packages', 'geometry', 'src'), (n) => n.endsWith('.test.ts'))
      .map((p) => path.relative(realRoot, p).split(path.sep).join('/'))
      .sort();
    const expected = [...appTestWalk().map((p) => `app/${p}`), ...geometry].sort();
    assert.ok(geometry.length > 0, 'the geometry walk finds its test files');
    assert.deepEqual(listed, expected, 'the root run lists the app set (app/ prefixed) and the geometry set');
  });

  // ---------- T3 ----------
  test('EZD-179 T3: the net-guard probe run prints no warning and passes its probe', () => {
    const r = probe();
    assert.equal(r.status, 0, `the probe run failed: ${r.stdout}\n${r.stderr}`);
    assert.deepEqual(warningsIn(r), [], 'the probe run must print no configLoader warning');
    assert.match(`${r.stdout}\n${r.stderr}`, /\b1 passed\b/, 'the probe run reports 1 passed test');
  });

  // ---------- T4 ----------
  test('EZD-179 T4: every app test file the include reaches is collected', () => {
    const r = appList();
    assert.equal(r.status, 0, `vitest list in app failed: ${r.stderr}`);
    const listed = listedFiles(r).map(fromRealRoot).map((p) => p.replace(/^app\//, '')).sort();
    const walked = appTestWalk();
    assert.ok(walked.length > 0, 'the walk finds app test files');
    assert.ok(listed.length > 0, 'the listing finds app test files');
    assert.deepEqual(listed, walked, 'the listing equals the walk of the app test folders');
  });

  // ---------- T5 ----------
  test('EZD-179 T5: the old config names are gone and the .mts names exist', () => {
    const gone = ['app/vitest.config.ts', 'app/test-harness/net-guard/probe.vitest.config.ts', 'vitest.config.ts'];
    const present = ['app/vitest.config.mts', 'app/test-harness/net-guard/probe.vitest.config.mts', 'vitest.config.mts'];
    for (const p of gone) assert.equal(existsSync(path.join(root, p)), false, `${p} must be renamed away`);
    for (const p of present) assert.equal(existsSync(path.join(root, p)), true, `${p} must exist`);
  });

  // ---------- T6 ----------
  test('EZD-179 T6: both app configs are listed by the app type-check program', () => {
    const r = run('pnpm', ['--filter', '@ezdraft/app', 'exec', 'tsc', '--noEmit', '--listFilesOnly'], root);
    assert.equal(r.status, 0, `tsc --listFilesOnly failed: ${r.stderr}`);
    const lines = r.stdout.split(/\r?\n/).filter((l) => l.length > 0);
    assert.ok(
      lines.some((l) => l.endsWith('/app/vitest.config.mts')),
      'the app type-check lists app/vitest.config.mts',
    );
    assert.ok(
      lines.some((l) => l.endsWith('/app/test-harness/net-guard/probe.vitest.config.mts')),
      'the app type-check lists app/test-harness/net-guard/probe.vitest.config.mts',
    );
  });

  // ---------- T7 ----------
  test('EZD-179 T7: no file silences the warning or swaps the config loader', () => {
    const files = [
      'package.json',
      'app/package.json',
      'app/vitest.config.mts',
      'app/test-harness/net-guard/probe.vitest.config.mts',
      'vitest.config.mts',
      'scripts/gate.mjs',
      'app/playwright.config.ts',
    ];
    for (const f of files) {
      const text = readFileSync(path.join(root, f), 'utf8');
      assert.equal(text.includes('VITE_CONFIG_NATIVE_IGNORE_WARNING'), false, `${f} must not name VITE_CONFIG_NATIVE_IGNORE_WARNING`);
      assert.equal(text.includes('configLoader'), false, `${f} must not name configLoader`);
    }
  });
});

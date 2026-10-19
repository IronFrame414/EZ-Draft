// EZD-000 · T7–T25: scripts/conventions/check.mjs (checks C1–C8).
// Sources: vault/plans/EZD-000.md (Step 3, Tests table); ticket Done when (AC-EZD-000-2);
// vault/spec/sections/02-product-overview.md (Named tools); CLAUDE.md rules 8, 11; vault/tickets/README.md spike rule.
// Fixture repos are built in a temporary directory; nothing is written into the repository.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const checkScript = path.join(root, 'scripts', 'conventions', 'check.mjs');

const tmpRoots = [];
after(() => { for (const d of tmpRoots) rmSync(d, { recursive: true, force: true }); });

// ---------- fixture helpers ----------

const PNPM = '9.1.0';

/** Default Dependencies rows for the clean fixture: [name, version]. */
const CLEAN_DEPS = [
  ['pnpm', PNPM],
  ['next', '15.0.0'],
  ['react', '19.0.0'],
  ['react-dom', '19.0.0'],
  ['typescript', '5.6.0'],
  ['zod', '3.23.8'],
  ['vitest', '2.1.0'],
  ['pdfkit', '0.15.0'],
];

function archDoc(rows) {
  const lines = rows.map(([n, v]) => `| \`${n}\` | \`${v}\` | app | fixture | EZD-000 |`);
  return [
    '# Architecture (fixture)',
    '',
    '## Dependencies',
    '',
    '| Package | Version | Used in | Why | Added by |',
    '| --- | --- | --- | --- | --- |',
    ...lines,
    '',
  ].join('\n');
}

const WORKSPACE_YAML = 'packages:\n  - app\n  - packages/*\n  - worker\n  - spikes/*\n';

function pkgJson(name, extra = {}) {
  return JSON.stringify({ name, private: true, ...extra }, null, 2) + '\n';
}

/** Files of the clean repo (T7). Keys are repo-relative paths. */
function cleanFiles() {
  return {
    'docs/architecture.md': archDoc(CLEAN_DEPS),
    'pnpm-workspace.yaml': WORKSPACE_YAML,
    'package.json': pkgJson('ezdraft', { packageManager: `pnpm@${PNPM}` }),
    'app/package.json': pkgJson('@ezdraft/app', {
      dependencies: { next: '15.0.0', react: '19.0.0', 'react-dom': '19.0.0' },
      devDependencies: { typescript: '5.6.0', vitest: '2.1.0' },
    }),
    'packages/geometry/package.json': pkgJson('@ezdraft/geometry', { dependencies: { zod: '3.23.8' } }),
    'worker/package.json': pkgJson('@ezdraft/worker', { dependencies: { zod: '3.23.8' } }),
    'spikes/EZD-027-canvas/package.json': pkgJson('@ezdraft/spike-ezd-027-canvas', { dependencies: { zod: '3.23.8' } }),
  };
}

/** Writes a fixture repo: clean files, then `overrides` (a value of null deletes the file). */
function makeRepo(overrides = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd000-'));
  tmpRoots.push(dir);
  const files = { ...cleanFiles(), ...overrides };
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue;
    const p = path.join(dir, rel);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  return dir;
}

function runCheck(dir) {
  const r = spawnSync(process.execPath, [checkScript, dir], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

function expectPass(dir, label) {
  const r = runCheck(dir);
  assert.equal(r.code, 0, `${label}: check should pass\n${r.out}`);
}

function expectFail(dir, checkId, names, label) {
  const r = runCheck(dir);
  assert.equal(r.code, 1, `${label}: check should fail with exit 1\n${r.out}`);
  assert.ok(r.out.includes(`[${checkId}]`), `${label}: output must name ${checkId}\n${r.out}`);
  for (const n of names) assert.ok(r.out.includes(n), `${label}: output must name "${n}"\n${r.out}`);
}

/** Clean app package.json with one field patched in. */
function appPkg(patch) {
  const base = JSON.parse(cleanFiles()['app/package.json']);
  return JSON.stringify({ ...base, ...patch }, null, 2) + '\n';
}

// ---------- T7–T16: C1 dependencies, C2 workspace ----------

test('EZD-000 T7: a clean repo passes', () => {
  assert.ok(existsSync(checkScript), `missing ${checkScript}`);
  expectPass(makeRepo(), 'T7');
});

test('EZD-000 T8 (AC-EZD-000-2) done when: a dependency the file does not list fails the check', () => {
  const base = JSON.parse(cleanFiles()['app/package.json']);
  base.dependencies['left-pad'] = '1.3.0';
  const dir = makeRepo({ 'app/package.json': JSON.stringify(base, null, 2) });
  expectFail(dir, 'C1', ['app/package.json', 'left-pad'], 'T8');
});

test('EZD-000 T9: an unlisted devDependency fails', () => {
  const dir = makeRepo({
    'packages/geometry/package.json': pkgJson('@ezdraft/geometry', {
      dependencies: { zod: '3.23.8' },
      devDependencies: { 'left-pad': '1.3.0' },
    }),
  });
  expectFail(dir, 'C1', ['packages/geometry/package.json', 'left-pad'], 'T9');
});

test('EZD-000 T10: a range specifier fails', () => {
  const dir = makeRepo({
    'packages/geometry/package.json': pkgJson('@ezdraft/geometry', { dependencies: { zod: '^3.23.8' } }),
  });
  expectFail(dir, 'C1', ['zod'], 'T10');
});

test('EZD-000 T11: a version that differs from the table fails', () => {
  const dir = makeRepo({
    'packages/geometry/package.json': pkgJson('@ezdraft/geometry', { dependencies: { zod: '3.23.9' } }),
  });
  expectFail(dir, 'C1', ['zod'], 'T11');
});

test('EZD-000 T12: workspace:* dependencies are exempt', () => {
  const base = JSON.parse(cleanFiles()['app/package.json']);
  base.dependencies['@ezdraft/geometry'] = 'workspace:*';
  expectPass(makeRepo({ 'app/package.json': JSON.stringify(base, null, 2) }), 'T12');
});

test('EZD-000 T13: package.json files under .claude/worktrees and vault are ignored', () => {
  const dir = makeRepo({
    '.claude/worktrees/x/package.json': pkgJson('x', { dependencies: { 'left-pad': '1.3.0' } }),
    'vault/x/package.json': pkgJson('y', { dependencies: { 'left-pad': '1.3.0' } }),
  });
  expectPass(dir, 'T13');
});

test('EZD-000 T14: spike packages are checked too', () => {
  const dir = makeRepo({
    'spikes/EZD-028-pdf/package.json': pkgJson('@ezdraft/spike-ezd-028-pdf', { dependencies: { 'left-pad': '1.3.0' } }),
  });
  expectFail(dir, 'C1', ['spikes/EZD-028-pdf/package.json', 'left-pad'], 'T14');
});

test('EZD-000 T15: root packageManager must match the pnpm row', () => {
  const dir = makeRepo({ 'package.json': pkgJson('ezdraft', { packageManager: 'pnpm@9.0.0' }) });
  expectFail(dir, 'C1', ['pnpm'], 'T15');
});

test('EZD-000 T16: a duplicate Dependencies row fails', () => {
  const dir = makeRepo({ 'docs/architecture.md': archDoc([...CLEAN_DEPS, ['zod', '3.23.8']]) });
  expectFail(dir, 'C1', ['zod'], 'T16a');
});

test('EZD-000 T16: a non-exact Dependencies row fails', () => {
  const rows = CLEAN_DEPS.map(([n, v]) => (n === 'zod' ? [n, '^3.0.0'] : [n, v]));
  const dir = makeRepo({ 'docs/architecture.md': archDoc(rows) });
  expectFail(dir, 'C1', ['zod'], 'T16b');
});

// ---------- T17–T18: C2 workspace layout and naming ----------

test('EZD-000 T17: an extra workspace glob fails', () => {
  const dir = makeRepo({ 'pnpm-workspace.yaml': WORKSPACE_YAML + '  - tools/*\n' });
  expectFail(dir, 'C2', ['pnpm-workspace.yaml'], 'T17a');
});

test('EZD-000 T17: a missing workspace glob fails', () => {
  const dir = makeRepo({ 'pnpm-workspace.yaml': 'packages:\n  - app\n  - packages/*\n  - spikes/*\n' });
  expectFail(dir, 'C2', ['pnpm-workspace.yaml'], 'T17b');
});

test('EZD-000 T18: a workspace package not named @ezdraft/* fails', () => {
  const dir = makeRepo({ 'worker/package.json': pkgJson('render-worker', { dependencies: { zod: '3.23.8' } }) });
  expectFail(dir, 'C2', ['worker/package.json'], 'T18a');
});

test('EZD-000 T18: a workspace package without "private": true fails', () => {
  const dir = makeRepo({
    'worker/package.json': JSON.stringify({ name: '@ezdraft/worker', dependencies: { zod: '3.23.8' } }, null, 2),
  });
  expectFail(dir, 'C2', ['worker/package.json'], 'T18b');
});

// ---------- T19: C3 geometry has no UI ----------

test('EZD-000 T19: geometry depending on react fails', () => {
  const dir = makeRepo({
    'packages/geometry/package.json': pkgJson('@ezdraft/geometry', { dependencies: { zod: '3.23.8', react: '19.0.0' } }),
  });
  expectFail(dir, 'C3', ['packages/geometry/package.json', 'react'], 'T19a');
});

test('EZD-000 T19: a .tsx file in geometry fails', () => {
  const dir = makeRepo({ 'packages/geometry/src/view.tsx': 'export const View = () => null;\n' });
  expectFail(dir, 'C3', ['packages/geometry/src/view.tsx'], 'T19b');
});

// ---------- T20: C4 spikes are never imported ----------

test('EZD-000 T20: app source importing from spikes/ fails', () => {
  const dir = makeRepo({ 'app/src/lib/a.ts': "import { x } from '../../../spikes/EZD-027-canvas/x';\nexport { x };\n" });
  expectFail(dir, 'C4', ['app/src/lib/a.ts'], 'T20a');
});

test('EZD-000 T20: app depending on an @ezdraft/spike-* package fails', () => {
  const base = JSON.parse(cleanFiles()['app/package.json']);
  base.dependencies['@ezdraft/spike-ezd-027-canvas'] = 'workspace:*';
  const dir = makeRepo({ 'app/package.json': JSON.stringify(base, null, 2) });
  expectFail(dir, 'C4', ['app/package.json', '@ezdraft/spike-ezd-027-canvas'], 'T20b');
});

test('EZD-000 T20: a test file importing from spikes/ passes', () => {
  const dir = makeRepo({ 'app/e2e/s.spec.ts': "import { x } from '../../spikes/EZD-027-canvas/x';\nexport { x };\n" });
  expectPass(dir, 'T20c');
});

// ---------- T21: C5 migration names ----------

test('EZD-000 T21: a timestamp-named migration passes', () => {
  expectPass(makeRepo({ 'supabase/migrations/20261012093000_create_tenant.sql': 'select 1;\n' }), 'T21a');
});

test('EZD-000 T21: a migration without the 14-digit timestamp fails', () => {
  const dir = makeRepo({ 'supabase/migrations/0001_init.sql': 'select 1;\n' });
  expectFail(dir, 'C5', ['0001_init.sql'], 'T21b');
});

test('EZD-000 T21: a migration with capitals or hyphens fails', () => {
  const dir = makeRepo({ 'supabase/migrations/20261012093000_Create-Tenant.sql': 'select 1;\n' });
  expectFail(dir, 'C5', ['20261012093000_Create-Tenant.sql'], 'T21c');
});

test('EZD-000 T21: two migrations sharing a timestamp fail', () => {
  const dir = makeRepo({
    'supabase/migrations/20261012093000_create_tenant.sql': 'select 1;\n',
    'supabase/migrations/20261012093000_create_project.sql': 'select 1;\n',
  });
  expectFail(dir, 'C5', ['20261012093000'], 'T21d');
});

// ---------- T22: C6 PDFKit only in jobs ----------

const PDFKIT_IMPORT = "import PDFDocument from 'pdfkit';\nexport const doc = () => new PDFDocument();\n";

test('EZD-000 T22: pdfkit imported in app/src/server/jobs passes', () => {
  expectPass(makeRepo({ 'app/src/server/jobs/pdf/write.ts': PDFKIT_IMPORT }), 'T22a');
});

test('EZD-000 T22: pdfkit imported in app/src/lib fails', () => {
  expectFail(makeRepo({ 'app/src/lib/pdf.ts': PDFKIT_IMPORT }), 'C6', ['app/src/lib/pdf.ts'], 'T22b');
});

test('EZD-000 T22: pdfkit imported in packages/geometry fails', () => {
  expectFail(makeRepo({ 'packages/geometry/src/x.ts': PDFKIT_IMPORT }), 'C6', ['packages/geometry/src/x.ts'], 'T22c');
});

// ---------- T23: C7 test file naming ----------

const VITEST_IMPORT = "import { test } from 'vitest';\ntest('a', () => {});\n";
const PLAYWRIGHT_IMPORT = "import { test } from '@playwright/test';\ntest('b', async () => {});\n";

test('EZD-000 T23: a vitest file named *.test.ts passes', () => {
  expectPass(makeRepo({ 'packages/geometry/src/a.test.ts': VITEST_IMPORT }), 'T23a');
});

test('EZD-000 T23: a vitest file named *.spec.ts fails', () => {
  expectFail(makeRepo({ 'packages/geometry/src/a.spec.ts': VITEST_IMPORT }), 'C7', ['packages/geometry/src/a.spec.ts'], 'T23b');
});

test('EZD-000 T23: a Playwright file named *.spec.ts passes', () => {
  expectPass(makeRepo({ 'app/e2e/b.spec.ts': PLAYWRIGHT_IMPORT }), 'T23c');
});

test('EZD-000 T23: a Playwright file named *.test.ts fails', () => {
  expectFail(makeRepo({ 'app/e2e/b.test.ts': PLAYWRIGHT_IMPORT }), 'C7', ['app/e2e/b.test.ts'], 'T23d');
});

// ---------- T24: C8 console only in the logger ----------

const CONSOLE_CALL = "export function f() { console.log('x'); }\n";

test('EZD-000 T24: console in logger.ts passes', () => {
  expectPass(makeRepo({ 'app/src/server/logger.ts': CONSOLE_CALL }), 'T24a');
});

test('EZD-000 T24: console in a component fails', () => {
  expectFail(makeRepo({ 'app/src/components/x.tsx': CONSOLE_CALL }), 'C8', ['app/src/components/x.tsx'], 'T24b');
});

test('EZD-000 T24: console in a test file passes', () => {
  expectPass(makeRepo({ 'app/src/components/x.test.tsx': CONSOLE_CALL }), 'T24c');
});

// ---------- T25: the real repository ----------

test('EZD-000 T25: the real repository passes the conventions check', () => {
  assert.ok(existsSync(checkScript), `missing ${checkScript}`);
  const r = runCheck(root);
  assert.equal(r.code, 0, `check must exit 0 on the clean repo\n${r.out}`);
});

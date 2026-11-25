// EZD-1942: footprints include the tests that import the files they claim, and a replay of the loop's 90 DRIFT lines
// (audit 2026-11-23 W3) shows at least half of the drifted test files would have been in the claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTestImportGraph, isTest, specifiers, testsFor, withImportingTests } from '../import-graph.mjs';
import { FIXTURE, parseDriftLines, replay } from '../drift-replay.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function tree(files) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'import-graph-'));
  for (const [f, src] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    writeFileSync(path.join(dir, f), src);
  }
  return dir;
}

const REPO = {
  'packages/geometry/package.json': JSON.stringify({ name: '@ezdraft/geometry', exports: { '.': './src/index.ts', './benchmark': './src/benchmark/benchmark.ts' } }),
  'packages/geometry/src/index.ts': "export * from './rooms/area';\n",
  'packages/geometry/src/rooms/area.ts': 'export const area = 1;\n',
  'packages/geometry/src/rooms/area.test.ts': "import { area } from './area';\n",
  'packages/geometry/src/benchmark/benchmark.ts': 'export const b = 1;\n',
  'app/src/lib/thing.ts': "import { area } from '@ezdraft/geometry';\nexport const thing = area;\n",
  'app/src/lib/util/index.ts': 'export const u = 1;\n',
  'app/src/lib/thing.test.ts': "import { thing } from './thing.js';\nimport { u } from './util';\n",
  'app/src/components/Card.tsx': "import styles from './Card.module.css';\nexport function Card() { return null; }\n",
  'app/src/components/Card.module.css': '.a{}\n',
  'app/src/components/__tests__/card.tsx': "import { Card } from '@/components/Card';\nimport { b } from '@ezdraft/geometry/benchmark';\n",
  'app/src/components/card-css.test.ts': "const css = await import('./Card.module.css');\n",
  'app/src/server/mocked.test.ts': "vi.mock('@/lib/thing', () => ({}));\nimport type { X } from '../lib/thing';\n",
  'app/src/server/not-a-test.ts': "import { thing } from '../lib/thing';\n",
  'app/e2e/flow.spec.ts': "import { area } from '@ezdraft/geometry';\nimport { test } from '@playwright/test';\n",
  'app/node_modules/pkg/x.test.ts': "import { thing } from '../../src/lib/thing';\n",
  'scripts/loop/tool.mjs': 'export const t = 1;\n',
  'scripts/loop/__tests__/tool.test.mjs': "import { t } from '../tool.mjs';\nconst { t: t2 } = require('../tool.mjs');\n",
};

test('import specifiers: from, bare, dynamic, require and vi.mock', () => {
  assert.deepEqual(specifiers("import a from 'x';\nimport type { B } from \"y\";\nexport * from './z';\nimport './side.css';\nawait import('./lazy');\nrequire('./r');\nvi.mock('@/m');").sort(),
    ['./lazy', './r', './side.css', './z', '@/m', 'x', 'y']);
});

test('test files: *.test.*, *.spec.* and anything under __tests__', () => {
  assert.ok(isTest('app/src/a.test.ts') && isTest('app/src/a.db.test.ts') && isTest('app/e2e/a.spec.ts') && isTest('scripts/x/__tests__/a.mjs') && isTest('app/src/B.test.tsx'));
  assert.ok(!isTest('app/src/a.ts') && !isTest('app/src/testing.ts') && !isTest('app/src/a.module.css'));
});

test('the scan finds the tests that import each claimed file (relative, .js for .ts, @/, workspace package, dynamic, mock)', () => {
  const dir = tree(REPO);
  try {
    const g = buildTestImportGraph(dir);
    const tests = (f) => [...(g.importers.get(f) || [])].sort();
    assert.deepEqual(tests('packages/geometry/src/rooms/area.ts'), ['packages/geometry/src/rooms/area.test.ts']);
    assert.deepEqual(tests('app/src/lib/thing.ts'), ['app/src/lib/thing.test.ts', 'app/src/server/mocked.test.ts']);
    assert.deepEqual(tests('app/src/lib/util/index.ts'), ['app/src/lib/thing.test.ts']);
    assert.deepEqual(tests('app/src/components/Card.tsx'), ['app/src/components/__tests__/card.tsx']);
    assert.deepEqual(tests('app/src/components/Card.module.css'), ['app/src/components/card-css.test.ts']);
    assert.deepEqual(tests('packages/geometry/src/benchmark/benchmark.ts'), ['app/src/components/__tests__/card.tsx']);
    assert.deepEqual(tests('packages/geometry/src/index.ts'), ['app/e2e/flow.spec.ts']);
    assert.deepEqual(tests('scripts/loop/tool.mjs'), ['scripts/loop/__tests__/tool.test.mjs']);
    // node_modules is not scanned, and a source file's imports are not recorded (only tests join a claim).
    assert.ok(![...g.importers.values()].some((s) => [...s].some((f) => f.includes('node_modules') || f === 'app/src/server/not-a-test.ts')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the claim gains the importing tests; barrels, <new> placeholders, shared files and hubs are not followed', () => {
  const dir = tree(REPO);
  try {
    const r = withImportingTests(dir, ['app/src/lib/thing.ts', 'packages/geometry/src/index.ts', 'app/src/lib/util/index.ts', 'app/src/components/<new>', 'app/src/lib/thing.test.ts']);
    assert.deepEqual(r.added, ['app/src/server/mocked.test.ts']);
    assert.deepEqual(r.files, ['app/src/components/<new>', 'app/src/lib/thing.test.ts', 'app/src/lib/thing.ts', 'app/src/lib/util/index.ts', 'app/src/server/mocked.test.ts', 'packages/geometry/src/index.ts']);
    const g = buildTestImportGraph(dir);
    assert.deepEqual(testsFor(g, ['app/src/lib/thing.ts'], { skip: new Set(['app/src/lib/thing.ts']) }).added, []);
    const hub = testsFor(g, ['app/src/lib/thing.ts', 'scripts/loop/tool.mjs'], { maxPerFile: 1 });
    assert.deepEqual(hub.added, ['scripts/loop/__tests__/tool.test.mjs']);
    assert.deepEqual(hub.hubs, [{ file: 'app/src/lib/thing.ts', tests: 2 }]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the scan of this repo takes under 10 s and finds the loop tests of the loop modules (AC-3)', () => {
  const g = buildTestImportGraph(ROOT);
  assert.ok(g.ms < 10000, `scan took ${g.ms} ms`);
  assert.ok(g.importers.get('scripts/loop/lanes.mjs')?.has('scripts/loop/__tests__/lanes.test.mjs'));
  assert.ok(g.importers.get('scripts/loop/import-graph.mjs')?.has('scripts/loop/__tests__/import-graph.test.mjs'));
});

test('the loop runs the scan in the footprint step, on the footprint checkout, before it saves the footprint (AC-1, AC-3)', () => {
  const src = readFileSync(path.join(ROOT, 'scripts/loop.mjs'), 'utf8');
  const fn = src.slice(src.indexOf('async function predictFootprint'), src.indexOf('\n}\n', src.indexOf('async function predictFootprint')));
  assert.match(fn, /const tree = footprintTree\(\);/);
  assert.match(fn, /withImportingTests\(tree, fp\.files/);
  assert.ok(fn.indexOf('withImportingTests') < fn.indexOf('saveFootprint'));
  // Drift sees the files the branch added, so a new file under a <new> placeholder counts as claimed.
  assert.match(src, /--diff-filter=A/);
  assert.equal((src.match(/drift\(changed, readClaims\(ROOT\), t\.id, sharedSet\(ROOT\), added\)/g) || []).length, 2);
});

test('the DRIFT line parser reads the ticket, time and listed files', () => {
  assert.deepEqual(parseDriftLines('[2026-11-17T01:26:17Z] DRIFT EZD-729: changed 2 file(s) outside its claim: app/a.test.ts, app/b.ts\nother'),
    [{ ticket: 'EZD-729', ts: '2026-11-17T01:26:17Z', changed: 2, drifted: ['app/a.test.ts', 'app/b.ts'] }]);
});

test('replaying the 90 DRIFT lines: at least half of the drifted test files would have been in the claim (AC-2)', () => {
  const rows = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const r = replay(rows);
  assert.equal(r.lines, 90);
  // The audit counted 206 drifted test files in these lines; the fixture lists each (ticket, file) pair once.
  assert.ok(r.total >= 200 && r.total <= 215, `${r.total} drifted test files`);
  assert.ok(r.covered >= r.total / 2, `${r.covered} of ${r.total} covered`);
});

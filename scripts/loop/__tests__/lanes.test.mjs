// Build lanes (Josh 2026-11-16): tickets that build at the same time never edit the same file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { claimFiles, drift, impliedFiles, overlaps, parseFootprint, placeholderCovers, readClaims, schedule, withClaims } from '../lanes.mjs';

const T = (id) => ({ id });

test('a migration implies the generated database types; a dependency change implies the lockfile and architecture doc', () => {
  assert.deepEqual(impliedFiles(['supabase/migrations/<new>.sql']), ['app/src/server/db/database.types.ts', 'supabase/migrations/<new>.sql']);
  assert.deepEqual(impliedFiles(['app/package.json']), ['app/package.json', 'docs/architecture.md', 'pnpm-lock.yaml']);
});

test('the shared assumptions file is never a clash', () => {
  assert.deepEqual(impliedFiles(['vault/build/assumptions.md', 'a.ts']), ['a.ts']);
  assert.deepEqual(overlaps(['vault/build/assumptions.md'], { B: { files: ['vault/build/assumptions.md'] } }, 'A'), []);
});

test('paths are normalized: quotes, ./, line numbers; absolute and parent paths are dropped', () => {
  assert.deepEqual(impliedFiles(['`./app/x.ts:12-20`', '/etc/passwd', '../x', 'app/y.ts']), ['app/x.ts', 'app/y.ts']);
});

test('the same file in two footprints is a clash', () => {
  assert.deepEqual(overlaps(['app/a.ts', 'app/b.ts'], { B: { files: ['app/b.ts'] } }, 'A'), [{ file: 'app/b.ts', holder: 'B' }]);
  assert.deepEqual(overlaps(['app/a.ts'], { B: { files: ['app/b.ts'] } }, 'A'), []);
});

// EZD-1941 (audit W2): a ticket holds the single migration file it adds, not the folder.
test('two different new migrations do not clash; the same migration file still does', () => {
  assert.deepEqual(overlaps(['supabase/migrations/20261116000000_a.sql'], { B: { files: ['supabase/migrations/<new>.sql'] } }, 'A'), []);
  assert.deepEqual(overlaps(['supabase/migrations/20261116000000_a.sql'], { B: { files: ['supabase/migrations/20261116000100_b.sql'] } }, 'A'), []);
  assert.deepEqual(overlaps(['supabase/migrations/20261116000000_a.sql'], { B: { files: ['supabase/migrations/20261116000000_a.sql'] } }, 'A'),
    [{ file: 'supabase/migrations/20261116000000_a.sql', holder: 'B' }]);
});

test('a ticket never clashes with its own claim', () => {
  assert.deepEqual(overlaps(['app/a.ts'], { A: { files: ['app/a.ts'] } }, 'A'), []);
});

test('schedule fills free lanes in order, skipping a ticket that overlaps a running or just-chosen one', () => {
  const footprints = { A: { files: ['x.ts'] }, B: { files: ['x.ts', 'y.ts'] }, C: { files: ['z.ts'] }, D: { files: ['w.ts'] } };
  const r = schedule({ candidates: [T('A'), T('B'), T('C'), T('D')], footprints, claims: {}, free: 2 });
  assert.deepEqual(r.start.map((t) => t.id), ['A', 'C']);
  assert.equal(r.waiting[0].id, 'B');
  assert.match(r.waiting[0].reason, /x\.ts \(A\)/);
});

test('schedule respects files held by running tickets and skips tickets with no footprint', () => {
  const footprints = { A: { files: ['x.ts'] }, C: { files: ['z.ts'] } };
  const r = schedule({ candidates: [T('A'), T('B'), T('C')], footprints, claims: { R: { files: ['x.ts'] } }, free: 3 });
  assert.deepEqual(r.start.map((t) => t.id), ['C']);
  assert.deepEqual(r.waiting.map((w) => w.id), ['A', 'B']);
});

test('drift lists changed files outside the claim and those another ticket holds', () => {
  const claims = { A: { files: ['a.ts'] }, B: { files: ['b.ts'] } };
  const d = drift(['a.ts', 'b.ts', 'c.ts', 'vault/build/assumptions.md'], claims, 'A');
  assert.deepEqual(d.unclaimed, ['b.ts', 'c.ts']);
  assert.deepEqual(d.clashes, [{ file: 'b.ts', holder: 'B' }]);
});

test('parseFootprint reads the last files object', () => {
  const fp = parseFootprint('thinking {"files":["old.ts"]}\nmore\n{"files":["app/a.ts","supabase/migrations/<new>.sql"],"notes":"two"}');
  assert.deepEqual(fp.files, ['app/a.ts', 'app/src/server/db/database.types.ts', 'supabase/migrations/<new>.sql']);
  assert.equal(fp.notes, 'two');
  assert.equal(parseFootprint('no json here'), null);
});

test('claimFiles takes free files and refuses held ones', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lanes-'));
  mkdirSync(path.join(root, 'vault/build'), { recursive: true });
  try {
    withClaims(root, (c) => { c.A = { lane: 0, files: ['a.ts'] }; c.B = { lane: 1, files: ['b.ts'] }; });
    assert.deepEqual(claimFiles(root, 'A', ['c.ts']), { ok: true, added: ['c.ts'], clashes: [] });
    const r = claimFiles(root, 'A', ['b.ts', 'd.ts']);
    assert.equal(r.ok, false);
    assert.deepEqual(r.clashes, [{ file: 'b.ts', holder: 'B' }]);
    assert.deepEqual(readClaims(root).A.files, ['a.ts', 'c.ts']);
    assert.equal(claimFiles(root, 'Z', ['e.ts']).ok, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('claim.mjs exits 2 and prints the BLOCKED line the loop waits on when a file is held', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lanes-'));
  mkdirSync(path.join(root, 'vault/build'), { recursive: true });
  try {
    withClaims(root, (c) => { c['EZD-1'] = { lane: 0, files: [] }; c['EZD-2'] = { lane: 1, files: ['b.ts'] }; });
    const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), '../claim.mjs');
    const env = { ...process.env, EZD_BUILD_ROOT: root, EZD_TICKET: 'EZD-1' };
    const held = spawnSync(process.execPath, [cli, 'b.ts'], { env, encoding: 'utf8' });
    assert.equal(held.status, 2);
    assert.match(held.stdout, /^BLOCKED: waits for EZD-2 \(file held\)$/m);
    const free = spawnSync(process.execPath, [cli, 'c.ts'], { env, encoding: 'utf8' });
    assert.equal(free.status, 0);
    assert.deepEqual(readClaims(root)['EZD-1'].files, ['c.ts']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a file in the shared list may be held by two lanes; every other file still clashes', () => {
  const shared = new Set(['vault/build/assumptions.md', 'app/src/editor/ProjectEditor.tsx']);
  const footprints = { A: { files: ['app/src/editor/ProjectEditor.tsx', 'a.ts'] }, B: { files: ['app/src/editor/ProjectEditor.tsx', 'b.ts'] }, C: { files: ['a.ts'] } };
  const r = schedule({ candidates: [T('A'), T('B'), T('C')], footprints, claims: {}, free: 3, shared });
  assert.deepEqual(r.start.map((t) => t.id), ['A', 'B']);
  assert.deepEqual(r.waiting.map((w) => w.id), ['C']);
});

test('two not-yet-named new files in one folder do not clash, new migrations included (EZD-1941)', () => {
  assert.deepEqual(overlaps(['app/src/server/db/<new>'], { B: { files: ['app/src/server/db/<new>'] } }, 'A'), []);
  assert.deepEqual(overlaps(['supabase/migrations/<new>.sql'], { B: { files: ['supabase/migrations/<new>.sql'] } }, 'A'), []);
});

// EZD-1942: a file the branch added in a folder its footprint named with a `<new>` placeholder is in its claim.
test('a new file under a claimed <new> placeholder is not drift; an edited file there still is', () => {
  const claims = { A: { files: ['app/e2e/<new>', 'app/src/lib/x/<new>', 'app/src/y/<new>.spec.ts'] }, B: { files: ['app/e2e/old.spec.ts'] } };
  const changed = ['app/e2e/new-flow.spec.ts', 'app/e2e/old.spec.ts', 'app/src/lib/x/a.test.ts', 'app/src/lib/x/deep/b.test.ts', 'app/src/y/c.spec.ts', 'app/src/y/d.test.ts'];
  const added = ['app/e2e/new-flow.spec.ts', 'app/src/lib/x/a.test.ts', 'app/src/lib/x/deep/b.test.ts', 'app/src/y/c.spec.ts', 'app/src/y/d.test.ts'];
  const d = drift(changed, claims, 'A', undefined, added);
  // old.spec.ts existed (not added); deep/ is a subfolder; d.test.ts does not end with the placeholder's `.spec.ts`.
  assert.deepEqual(d.unclaimed, ['app/e2e/old.spec.ts', 'app/src/lib/x/deep/b.test.ts', 'app/src/y/d.test.ts']);
  assert.deepEqual(d.clashes, [{ file: 'app/e2e/old.spec.ts', holder: 'B' }]);
  // Without the added list (the old call), every file outside the exact names drifts.
  assert.equal(drift(changed, claims, 'A').unclaimed.length, 6);
});

test('placeholderCovers matches the same folder and the suffix after <new>', () => {
  assert.equal(placeholderCovers('app/e2e/<new>', 'app/e2e/a.spec.ts'), true);
  assert.equal(placeholderCovers('app/e2e/<new>.spec.ts', 'app/e2e/a.spec.ts'), true);
  assert.equal(placeholderCovers('app/e2e/<new>.spec.ts', 'app/e2e/a.test.ts'), false);
  assert.equal(placeholderCovers('app/e2e/<new>', 'app/e2e/sub/a.spec.ts'), false);
  assert.equal(placeholderCovers('app/e2e/<new>', 'app/e2eX/a.spec.ts'), false);
  assert.equal(placeholderCovers('app/e2e/a.ts', 'app/e2e/a.ts'), false);
});

test('a new file under a <new> placeholder is still a clash when another lane named the same new path', () => {
  const claims = { A: { files: ['app/e2e/<new>'] }, B: { files: ['app/e2e/foo.spec.ts'] } };
  const d = drift(['app/e2e/foo.spec.ts', 'app/e2e/bar.spec.ts'], claims, 'A', undefined, ['app/e2e/foo.spec.ts', 'app/e2e/bar.spec.ts']);
  assert.deepEqual(d.unclaimed, []);
  assert.deepEqual(d.placed, ['app/e2e/foo.spec.ts', 'app/e2e/bar.spec.ts']);
  assert.deepEqual(d.clashes, [{ file: 'app/e2e/foo.spec.ts', holder: 'B' }]);
});

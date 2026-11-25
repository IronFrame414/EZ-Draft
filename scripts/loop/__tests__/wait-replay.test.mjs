// EZD-1941 AC-3: replaying the "lanes free" lines of vault/build/loop.log from 2026-11-13 to 2026-11-23 (frozen in
// fixtures/lanes-free-2026-11-13-to-23.txt; loop.log itself is untracked) with the new rules, no wait that named only
// docs/architecture.md, database.types.ts and the migrations folder (with files already shared) happens any more.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sharedSet, SHARED_OK } from '../lanes.mjs';
import { parseWaitLines, replay, stillBlocks } from '../wait-replay.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const lines = parseWaitLines(readFileSync(path.join(here, 'fixtures/lanes-free-2026-11-13-to-23.txt'), 'utf8'));
const W2 = new Set(['docs/architecture.md', 'app/src/server/db/database.types.ts', 'supabase/migrations/']);
// The files that were already shared before this ticket (the message catalogs joined on 2026-11-17).
const before = new Set([...SHARED_OK, 'app/src/server/messages/catalogs/en.ts', 'app/src/server/messages/catalogs/es.ts']);
const onlyW2 = (w) => w.needs.length > 0 && w.needs.every((n) => W2.has(n.file) || before.has(n.file)) && w.needs.some((n) => W2.has(n.file));

test('the fixture holds the audit\'s lanes-free lines from 2026-11-13 to 2026-11-23', () => {
  assert.ok(lines.length >= 149, `${lines.length} lines`);
  for (const l of lines) assert.ok(l.ts >= '2026-11-13' && l.ts < '2026-11-24', l.ts);
  for (const f of W2) assert.ok(lines.some((l) => l.waits.some((w) => w.needs.some((n) => n.file === f))), f);
});

test('parseWaitLines reads ticket, file and holder, including paths with parentheses', () => {
  const [l] = parseWaitLines('[2026-11-16T16:18:59Z] lanes free: 2; next tickets wait on held files: EZD-1 needs app/src/app/(editor)/p.tsx (EZD-2), supabase/migrations/ (EZD-3); EZD-4 needs docs/architecture.md (EZD-2)');
  assert.deepEqual(l, { ts: '2026-11-16T16:18:59Z', waits: [
    { id: 'EZD-1', needs: [{ file: 'app/src/app/(editor)/p.tsx', holder: 'EZD-2' }, { file: 'supabase/migrations/', holder: 'EZD-3' }] },
    { id: 'EZD-4', needs: [{ file: 'docs/architecture.md', holder: 'EZD-2' }] },
  ] });
});

test('under the old rules those waits were real; under the new rules none of them happens', () => {
  const oldShared = before;
  const r = replay(lines, sharedSet(repo));
  const targeted = r.filter(onlyW2);
  assert.ok(targeted.length > 0, 'the log has waits that named only these files');
  // Old rules: the migrations folder and the two files clashed.
  for (const w of targeted) {
    const oldStill = w.needs.filter((n) => n.file === 'supabase/migrations/' || !oldShared.has(n.file));
    assert.ok(oldStill.length > 0, `${w.ts} ${w.id}`);
  }
  const left = targeted.filter((w) => w.still.length > 0);
  assert.deepEqual(left, []);
});

test('no replayed wait names architecture.md, database.types.ts or a migration any more; other files still wait', () => {
  const r = replay(lines, sharedSet(repo));
  for (const w of r) for (const n of w.still) assert.ok(!W2.has(n.file), `${w.ts} ${w.id} ${n.file}`);
  // A file outside the shared list still blocks (ProjectEditor.tsx is not shared).
  assert.equal(stillBlocks({ id: 'A', file: 'app/src/editor/ProjectEditor.tsx', holder: 'B' }, sharedSet(repo)), true);
  assert.ok(r.some((w) => w.still.some((n) => n.file === 'app/src/editor/ProjectEditor.tsx')));
});

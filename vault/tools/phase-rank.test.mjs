// EZD-360 T1-T2 (vault/plans/EZD-360.md section 4): the one phase order. Phase 56 ranks 5.5, every other phase its own number (D-Rank).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('./phase-rank.mjs');

test('EZD-360 T1 phaseRank gives 5.5 for 56 and the number itself for the others (AC-EZD-360-1)', async () => {
  const { phaseRank } = await load();
  assert.deepEqual([0, 1, 5, 6, 55, 56].map(phaseRank), [0, 1, 5, 6, 55, 5.5]);
});

test('EZD-360 T2 comparePhases sorts 56 between 5 and 6 (AC-EZD-360-1)', async () => {
  const { comparePhases } = await load();
  assert.deepEqual([6, 56, 0, 5, 55].sort(comparePhases), [0, 5, 56, 6, 55]);
});

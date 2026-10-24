// EZD-030 spike bench: time buildWallMesh(W1) (vault/plans/EZD-030.md Step 1; numbers recorded in README only).
// W1 is the fixture of the plan's Tests section.
import { describe, test } from 'vitest';
import type { WallInput } from './wall-face';
import { buildWallMesh } from './wall-mesh';

const W1: WallInput = {
  length: 144,
  thickness: 4.5,
  ceiling: { heightAtStart: 96, rise: 4, run: 12 },
  openings: [
    { kind: 'door', offset: 12, width: 36, height: 80, sill: 0 },
    { kind: 'window', offset: 84, width: 36, height: 60, sill: 42 },
  ],
};

// Vitest 5 gives bench through the test context.
describe('EZD-030 wall mesh bench', () => {
  test('buildWallMesh(W1)', async ({ bench }) => {
    await bench('buildWallMesh(W1)', () => {
      buildWallMesh(W1);
    }).run();
  });
});

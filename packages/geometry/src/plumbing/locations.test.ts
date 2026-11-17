// EZD-729 AC-EZD-729-1: a placed sink gets supply and drain locations. Expected values worked by hand from the layout
// recorded in vault/build/assumptions.md EZD-729 (on the back edge; hot 8" left and cold 8" right of the centre line,
// facing the sink; drain on the centre line; each drawn as the 6" utility diamond, 3" each way):
// a 33" × 22" sink at (100, 50) facing down has its back edge on y = 61, so hot (92, 61), drain (100, 61),
// cold (108, 61); the same sink facing right has its back edge on x = 89 and, facing it from the right, its left is
// -y, so hot (89, 42), drain (89, 50), cold (89, 58).
import { describe, expect, it } from 'vitest';
import type { FixtureObject } from '../fixtures/fixtures';
import { plumbingLocationItems, plumbingLocations } from './locations';

const F1 = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
const SINK = '00000000-0000-4000-8000-000000000001';

function fixture(
  kind: FixtureObject['data']['attributes']['kind'],
  axis: { x: number; y: number },
): FixtureObject {
  return {
    id: SINK,
    type: 'fixture',
    data: {
      geometry: { center: { x: 100, y: 50 }, axis },
      status: 'new',
      level: F1,
      attributes: { kind, width: 33, depth: 22 },
    },
  };
}

describe('EZD-729 plumbing locations', () => {
  it('AC-1 a sink facing down gets hot and cold supply and a drain on its back edge', () => {
    expect(plumbingLocations(fixture('sink', { x: 1, y: 0 }))).toEqual([
      { fixtureId: SINK, kind: 'hot', point: { x: 92, y: 61 } },
      { fixtureId: SINK, kind: 'drain', point: { x: 100, y: 61 } },
      { fixtureId: SINK, kind: 'cold', point: { x: 108, y: 61 } },
    ]);
  });

  it('AC-1 the locations turn with the sink (facing right)', () => {
    expect(plumbingLocations(fixture('sink', { x: 0, y: 1 }))).toEqual([
      { fixtureId: SINK, kind: 'hot', point: { x: 89, y: 42 } },
      { fixtureId: SINK, kind: 'drain', point: { x: 89, y: 50 } },
      { fixtureId: SINK, kind: 'cold', point: { x: 89, y: 58 } },
    ]);
  });

  it('a fixture that is not a sink gets none', () => {
    expect(plumbingLocations(fixture('range', { x: 1, y: 0 }))).toEqual([]);
    expect(plumbingLocationItems(fixture('refrigerator', { x: 1, y: 0 }))).toEqual([]);
  });

  it('each location draws a 6" diamond in the sink status colour, tied to the sink', () => {
    const items = plumbingLocationItems(fixture('sink', { x: 1, y: 0 }));
    expect(items).toHaveLength(12);
    for (const i of items) {
      expect(i).toMatchObject({ layer: 'new', objectId: SINK, kind: 'line', role: 'beyond' });
    }
    const drain = items.slice(4, 8).map((i) => (i.kind === 'line' ? i.from : null));
    expect(drain).toEqual([
      { x: 103, y: 61 },
      { x: 100, y: 64 },
      { x: 97, y: 61 },
      { x: 100, y: 58 },
    ]);
  });
});

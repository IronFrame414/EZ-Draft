// EZD-232 (S03 Select "Click picks the smallest object"; Q-0200 "clouds can also be added or removed by hand"): a
// revision cloud picks by its outline, as a switching zone does (a ring with area), so it can be selected and deleted
// while the smaller objects it surrounds still pick first.
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, type Point } from '@ezdraft/geometry';
import { planAnnotation } from '../plan/batches';
import { DEFAULT_PLAN_SCALE } from '../../lib/plan/plan-scale';
import { baseObjects, F1, uid, withWalls } from '../tools/test-utils/fixtures';
import { createPickIndex } from './pick-index';

const pt = (x: number, y: number): Point => ({ x, y });
const TOL = 1;

function objects() {
  // A wall from (0, 60) to (150, 60) inside a cloud from (-24, 0) to (174, 120).
  const o = withWalls(baseObjects(), 10, [pt(0, 60), pt(150, 60)], false);
  o.set(uid(40), {
    type: 'revision_cloud',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: {
      geometry: {
        boundary: [pt(-24, 0), pt(174, 0), pt(174, 120), pt(-24, 120)],
        tag: pt(174, 120),
      },
      level: F1,
      attributes: { source: 'manual', rev: null },
    },
  });
  return o;
}

describe('EZD-232 picking a revision cloud', () => {
  it('inside its outline picks the cloud; on the wall it surrounds, the wall first; outside, nothing', () => {
    const index = createPickIndex({ annotation: () => planAnnotation(DEFAULT_PLAN_SCALE) });
    index.sync(objects(), F1, []);
    expect(index.has(uid(40))).toBe(true);
    expect(index.pick(pt(75, 100), TOL)).toEqual([uid(40)]);
    expect(index.pick(pt(75, 60), TOL)[0]).toBe(uid(10));
    expect(index.pick(pt(300, 100), TOL)).toEqual([]);
  });
});

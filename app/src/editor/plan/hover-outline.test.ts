// EZD-218 (Q-0676 (a)): a selected or hovered room draws its outline as lines, with no fill. Fixture: one room
// (0,0) (144,0) (144,120) (0,120) on the plan; expected by hand: four edges, six numbers each, no fill or body.
import type { Point } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { baseObjects, roomValue, uid } from '../tools/test-utils/fixtures';
import { planDrawingList } from './batches';
import { objectGeometry } from './hover';

const pt = (x: number, y: number): Point => ({ x, y });
const RING = [pt(0, 0), pt(144, 0), pt(144, 120), pt(0, 120)];

describe('EZD-218 room outline look', () => {
  it('the outline lookup draws the ring as segments only', () => {
    const objects = baseObjects();
    objects.set(uid(9), roomValue(RING, 'Kitchen', null));
    const list = planDrawingList(objects);
    const g = objectGeometry(list, new Set([uid(9)]), null, (id) => (id === uid(9) ? RING : null));
    expect(g.fill).toHaveLength(0);
    expect(g.body).toHaveLength(0);
    expect([...g.segments]).toEqual([
      0, 0, 0, 144, 0, 0, 144, 0, 0, 144, 120, 0, 144, 120, 0, 0, 120, 0, 0, 120, 0, 0, 0, 0,
    ]);
  });

  it('without the lookup a room draws nothing', () => {
    const objects = baseObjects();
    objects.set(uid(9), roomValue(RING, 'Kitchen', null));
    const g = objectGeometry(planDrawingList(objects), new Set([uid(9)]), null);
    expect(g.segments).toHaveLength(0);
  });
});

// EZD-501 (S05 Data shown "Room ceilings … (model object: ceiling type per room)"): the ceiling is room data, so a
// wall edit that moves the room's outline keeps it (EZD-218 room-fields-sync setup: a 144 × 120 room in a
// 150 × 120 chain takes the new outline). Values: S05 summary "ridge 13' 0" · 9.4/12".
import { describe, expect, it, vi } from 'vitest';
import type { ModelObject, Point } from '../schema';
import { reconcileRooms } from './sync';
import { chain, F1, roomObj, uid } from './test-utils/fixtures';

const P = (x: number, y: number): Point => ({ x, y });
const R = (w: number, d: number): Point[] => [P(0, 0), P(w, 0), P(w, d), P(0, d)];

describe('EZD-501 room ceiling across reconcile', () => {
  it('a moved wall keeps the ceiling type, ridge height and pitch', () => {
    const room = roomObj(uid(101), R(144, 120), 'Family room');
    const fields = {
      ...room.data.attributes,
      ceilingType: 'vaulted' as const,
      ceiling: {
        heightsBy: 'pitch' as const,
        wallHeights: [],
        pointHeights: [],
        pitch: 9.4,
        ridge: { start: P(0, 60), end: P(144, 60), height: 156 },
      },
    };
    const vaulted = { ...room, data: { ...room.data, attributes: fields } };
    const objects: ModelObject[] = [...chain(1, R(150, 120), 'right'), vaulted];
    const r = reconcileRooms(
      objects,
      F1,
      vi.fn(() => uid(999)),
    );
    expect(r.update).toHaveLength(1);
    expect(r.update[0]!.id).toBe(vaulted.id);
    expect(r.update[0]!.data.attributes).toEqual(fields);
  });
});

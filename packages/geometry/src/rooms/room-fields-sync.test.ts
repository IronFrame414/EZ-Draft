// EZD-218 (03 Q-0664 "Rooms gain …"; AC-EZD-218-4 "a room type set to Bath persists"): a wall edit that moves a room's
// outline keeps the room's type, floor finish and ceiling type (EZD-205a T13 setup: a 144 × 120 room in a
// 150 × 120 chain takes the new outline).
import { describe, expect, it, vi } from 'vitest';
import type { ModelObject, Point } from '../schema';
import { reconcileRooms } from './sync';
import { chain, F1, roomObj, uid } from './test-utils/fixtures';

const P = (x: number, y: number): Point => ({ x, y });
const R = (w: number, d: number): Point[] => [P(0, 0), P(w, 0), P(w, d), P(0, d)];

describe('EZD-218 room fields across reconcile', () => {
  it('a moved wall keeps the room name, type, floor finish and ceiling type', () => {
    const room = roomObj(uid(101), R(144, 120), 'Hall bath');
    const fields = {
      ...room.data.attributes,
      roomType: 'bath' as const,
      floorFinish: 'Porcelain tile',
      ceilingType: 'tray' as const,
    };
    const kitchen = { ...room, data: { ...room.data, attributes: fields } };
    const objects: ModelObject[] = [...chain(1, R(150, 120), 'right'), kitchen];
    const r = reconcileRooms(
      objects,
      F1,
      vi.fn(() => uid(999)),
    );
    expect(r.update).toHaveLength(1);
    expect(r.update[0]!.id).toBe(kitchen.id);
    expect(r.update[0]!.data.attributes).toEqual(fields);
  });
});

// EZD-205b · KP1, KP2: Keep out of square stores the override on the room (vault/plans/EZD-205b.md section 1
// Decided "Keep steps", "nextRoomNumber"; section 4; AC-EZD-205-4). Expected values: 09j Keep out of square
// (120 SF); Q-0568; Q-0570; P205a Create and `closureOverrideSchema`.
import { describe, expect, it, vi } from 'vitest';
import type { ModelObject, Point } from '../schema';
import { roomAreaSqFt } from './area';
import { findClosures, type GapReport } from './closure';
import { keepOutOfSquare } from './override';
import { chain, F1, F2, idSeq, openChain, roomObj, uid } from './test-utils/fixtures';

const P = (x: number, y: number): Point => ({ x, y });
const ROW2 = openChain(1, [P(0, 0), P(144, 0), P(144, 120), P(0, 120), P(0, 0.5)]);
const IDS4 = [uid(1), uid(2), uid(3), uid(4)];
const WHEN = '2026-11-06T12:00:00.000Z';

function expectGap(got: Point, want: Point): void {
  expect(got.x, 'gap x').toBeCloseTo(want.x, 12);
  expect(got.y, 'gap y').toBeCloseTo(want.y, 12);
}

describe('EZD-205b keep out of square', () => {
  it('KP1 keeps the row 2 room at 120 SF with who, when and the gap', () => {
    const objs: ModelObject[] = [
      ...ROW2,
      roomObj(uid(30), [P(300, 0), P(310, 0), P(310, 10), P(300, 10)], 'Room 4', F2),
    ];
    const r = keepOutOfSquare(objs, IDS4, uid(7), WHEN, idSeq(900));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rooms.update).toEqual([]);
    expect(r.rooms.delete).toEqual([]);
    expect(r.rooms.create).toHaveLength(1);
    const c = r.rooms.create[0]!;
    expect(c.id).toBe(uid(900));
    expect(c.type).toBe('room');
    expect(c.data.attributes.name).toBe('Room 5');
    expect(c.data.status).toBe('existing');
    expect(c.data.level).toBe(F1);
    expect(c.data.closureOverride).not.toBeNull();
    expect(c.data.closureOverride!.who).toBe(uid(7));
    expect(c.data.closureOverride!.when).toBe(WHEN);
    expectGap(c.data.closureOverride!.gap, P(0, -0.5));
    expect(roomAreaSqFt(c.data.geometry.boundary)).toBe(120);
  });

  it('KP2 updates a paired room and refuses a stale gap or a malformed who or when', () => {
    const boundary = (findClosures(ROW2, F1)[0] as GapReport).boundary;
    const kitchen = roomObj(uid(31), boundary, 'Kitchen');
    const newId = vi.fn(() => uid(999));
    const r = keepOutOfSquare([...ROW2, kitchen], IDS4, uid(7), WHEN, newId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rooms.create).toEqual([]);
    expect(r.rooms.delete).toEqual([]);
    expect(r.rooms.update).toHaveLength(1);
    const u = r.rooms.update[0]!;
    expect(u.id).toBe(uid(31));
    expect(u.data.attributes.name).toBe('Kitchen');
    expect(u.data.closureOverride).not.toBeNull();
    expect(u.data.closureOverride!.who).toBe(uid(7));
    expect(u.data.closureOverride!.when).toBe(WHEN);
    expectGap(u.data.closureOverride!.gap, P(0, -0.5));
    expect(newId).not.toHaveBeenCalled();

    const closed = chain(1, [P(0, 0), P(144, 0), P(144, 120), P(0, 120)]);
    expect(keepOutOfSquare(closed, IDS4, uid(7), WHEN, idSeq(900))).toEqual({
      ok: false,
      reason: 'no_gap',
    });
    expect(keepOutOfSquare(ROW2, IDS4, 'u1', WHEN, idSeq(900))).toEqual({
      ok: false,
      reason: 'invalid_override',
    });
    expect(keepOutOfSquare(ROW2, IDS4, uid(7), '2026-11-06', idSeq(900))).toEqual({
      ok: false,
      reason: 'invalid_override',
    });
  });
});

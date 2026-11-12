// EZD-205a · T11 to T16: reconcileRooms keeps the stored rooms matched to the outlines (vault/plans/EZD-205a.md
// section 1 Decided "Reconcile scope", "Reconcile matching", "Update", "Create", "Result order"; section 4;
// AC-EZD-205-1, AC-EZD-205-5). Expected values: Q-0568 (Room N); Q-0558; Q-0592 (a); Q-0613 (a) (QP-2);
// 09j Moving a wall row 1; 03g row 2.
import { describe, expect, it, vi } from 'vitest';
import type { ModelObject, Point } from '../schema';
import { moveWall } from '../walls/move';
import { outlineAreaSqIn, roomAreaSqFt } from './area';
import { keepOutOfSquare } from './override';
import { reconcileRooms, type RoomObject } from './sync';
import {
  applyChanged,
  chain,
  F1,
  F2,
  idSeq,
  openChain,
  roomObj,
  uid,
  wallObj,
} from './test-utils/fixtures';

const P = (x: number, y: number): Point => ({ x, y });
const R = (w: number, d: number): Point[] => [P(0, 0), P(w, 0), P(w, d), P(0, d)];

const WEST = [P(0, 0), P(57.75, 0), P(57.75, 120), P(0, 120)];
const EAST = [P(62.25, 0), P(144, 0), P(144, 120), P(62.25, 120)];
const EMPTY = { create: [], update: [], delete: [] };

function expectBoundary(got: Point[], want: Point[]): void {
  expect(got).toHaveLength(want.length);
  want.forEach((p, k) => {
    expect(got[k]!.x, `point ${k} x`).toBeCloseTo(p.x, 9);
    expect(got[k]!.y, `point ${k} y`).toBeCloseTo(p.y, 9);
  });
}
const neverCalled = () => vi.fn(() => uid(999));
const partitionWalls = () => [
  ...chain(1, R(144, 120), 'right'),
  wallObj(uid(5), P(60, 0), P(60, 120), 'center'),
];

const OVERRIDE = { who: uid(7), when: '2026-11-06T12:00:00.000Z', gap: { x: 0, y: 0.5 } };

describe('EZD-205a room reconcile', () => {
  it('EZD-205a T11 create: new rooms are numbered after the highest Room N in the model', () => {
    const objects: ModelObject[] = [
      ...chain(1, R(144, 120), 'right'),
      ...chain(5, [P(200, 0), P(248, 0), P(248, 48), P(200, 48)], 'right'),
      roomObj(uid(101), R(144, 120), 'Room 3', F2),
      roomObj(uid(102), R(144, 120), 'Room 10', F2),
      roomObj(uid(103), R(144, 120), 'Kitchen', F2),
      roomObj(uid(104), R(144, 120), 'Room 07', F2),
      roomObj(uid(105), R(144, 120), 'room 12', F2),
    ];
    const newId = vi.fn(idSeq(900));
    const r = reconcileRooms(objects, F1, newId);
    expect(r.update).toEqual([]);
    expect(r.delete).toEqual([]);
    expect(r.create).toHaveLength(2);
    expect(newId).toHaveBeenCalledTimes(2);
    const [a, b] = r.create;
    expect(a!.id).toBe(uid(900));
    expect(a!.data.attributes.name).toBe('Room 11');
    expectBoundary(a!.data.geometry.boundary.slice(0, 1), [P(0, 0)]);
    expect(b!.id).toBe(uid(901));
    expect(b!.data.attributes.name).toBe('Room 12');
    expectBoundary(b!.data.geometry.boundary.slice(0, 1), [P(200, 0)]);
    for (const c of r.create) {
      expect(c.type).toBe('room');
      expect(c.data.status).toBe('existing');
      expect(c.data.closureOverride).toBeNull();
      expect(c.data.level).toBe(F1);
    }
  });

  it('EZD-205a T12 unchanged: a stored room with the same outline gives no change', () => {
    const reversedFrom144 = [P(144, 120), P(144, 0), P(0, 0), P(0, 120)];
    const nudged = [P(144.015625, 120), P(144, 0), P(0, 0), P(0, 120)];
    const cases: [string, ModelObject[]][] = [
      [
        '(a) reversed, other start',
        [...chain(1, R(144, 120), 'right'), roomObj(uid(101), reversedFrom144, 'Kitchen')],
      ],
      [
        '(b) template room',
        [...chain(1, R(141.5, 168), 'right'), roomObj(uid(101), R(141.5, 168), 'L-kitchen')],
      ],
      [
        '(c) one vertex 1/64" off',
        [...chain(1, R(144, 120), 'right'), roomObj(uid(101), nudged, 'Kitchen')],
      ],
    ];
    for (const [name, objects] of cases) {
      const newId = neverCalled();
      expect(reconcileRooms(objects, F1, newId), name).toEqual(EMPTY);
      expect(newId, name).not.toHaveBeenCalled();
    }
  });

  it('EZD-205a T13 moved wall: the stored room keeps its id and name and takes the new outline', () => {
    const kitchen = roomObj(uid(101), R(144, 120), 'Kitchen');
    const objects: ModelObject[] = [...chain(1, R(150, 120), 'right'), kitchen];
    const before = structuredClone(objects);
    const newId = neverCalled();
    const r = reconcileRooms(objects, F1, newId);
    expect(r.create).toEqual([]);
    expect(r.delete).toEqual([]);
    expect(r.update).toHaveLength(1);
    const u = r.update[0]!;
    expect(u.id).toBe(kitchen.id);
    expect(u.type).toBe('room');
    expect(u.data.attributes.name).toBe('Kitchen');
    expect(u.data.status).toBe('existing');
    expect(u.data.closureOverride).toBeNull();
    expect(u.data.level).toBe(F1);
    expectBoundary(u.data.geometry.boundary, R(150, 120));
    expect(roomAreaSqFt(u.data.geometry.boundary)).toBe(125);
    expect(objects).toEqual(before);
  });

  it('EZD-205a T14 done when: split keeps name: the larger part keeps the room, the other is a new room', () => {
    const kitchen = roomObj(uid(101), R(144, 120), 'Kitchen');
    const newId = vi.fn(idSeq(900));
    const r = reconcileRooms([...partitionWalls(), kitchen], F1, newId);
    expect(r.delete).toEqual([]);
    expect(r.update).toHaveLength(1);
    expect(r.update[0]!.id).toBe(kitchen.id);
    expect(r.update[0]!.data.attributes.name).toBe('Kitchen');
    expectBoundary(r.update[0]!.data.geometry.boundary, EAST);
    expect(roomAreaSqFt(r.update[0]!.data.geometry.boundary)).toBe(68);
    expect(r.create).toHaveLength(1);
    expect(r.create[0]!.id).toBe(uid(900));
    expect(r.create[0]!.data.attributes.name).toBe('Room 1');
    expectBoundary(r.create[0]!.data.geometry.boundary, WEST);
    expect(roomAreaSqFt(r.create[0]!.data.geometry.boundary)).toBe(48);
  });

  it('EZD-205a T15 merge: the larger stored room keeps the merged outline, the other is deleted', () => {
    const pantry = roomObj(uid(101), WEST, 'Pantry');
    const kitchen = roomObj(uid(102), EAST, 'Kitchen');
    const r = reconcileRooms(
      [...chain(1, R(144, 120), 'right'), pantry, kitchen],
      F1,
      neverCalled(),
    );
    expect(r.create).toEqual([]);
    expect(r.delete).toEqual([pantry.id]);
    expect(r.update).toHaveLength(1);
    expect(r.update[0]!.id).toBe(kitchen.id);
    expect(r.update[0]!.data.attributes.name).toBe('Kitchen');
    expectBoundary(r.update[0]!.data.geometry.boundary, R(144, 120));
  });

  it('EZD-205a T16 delete, scope, override: free rooms of this level are deleted and a real outline clears an override', () => {
    const a = roomObj(uid(101), R(144, 120), 'A', F1, null);
    const b = roomObj(uid(102), R(144, 120), 'B', F1, OVERRIDE);
    const c = roomObj(uid(103), R(144, 120), 'C', F2);
    const open = chain(1, R(144, 120), 'right').slice(0, 3);
    const r = reconcileRooms([...open, a, b, c], F1, neverCalled());
    expect(r.delete).toEqual([a.id, b.id]);
    expect(r.create).toEqual([]);
    expect(r.update).toEqual([]);

    const newId = neverCalled();
    const r2 = reconcileRooms([...chain(1, R(150, 120), 'right'), b], F1, newId);
    expect(r2.create).toEqual([]);
    expect(r2.delete).toEqual([]);
    expect(r2.update).toHaveLength(1);
    const u = r2.update[0]!;
    expect(u.id).toBe(b.id);
    expect(u.data.attributes.name).toBe('B');
    expect(u.data.closureOverride).toBeNull();
    expectBoundary(u.data.geometry.boundary, R(150, 120));
    expect(newId).not.toHaveBeenCalled();
  });
});

// EZD-205b · SY1 to SY3: reconcileRooms with closure overrides (vault/plans/EZD-205b.md section 1 Decided "Reconcile
// with gaps"; section 4; AC-EZD-205-4). Expected values: 09j Keep out of square; 09j Moving a wall row 1; 03g rows
// 2-3; Q-0568; Q-0570.
const ROW2_PTS = [P(0, 0), P(144, 0), P(144, 120), P(0, 120), P(0, 0.5)];
const ROW2 = openChain(1, ROW2_PTS);
const IDS4 = [uid(1), uid(2), uid(3), uid(4)];
const row2Ending = (last: Point) => openChain(1, [...ROW2_PTS.slice(0, 4), last]);

// The KP1 room: Keep out of square on ROW2 by uid(7), created as uid(900).
function kp1Room(): RoomObject {
  const r = keepOutOfSquare(ROW2, IDS4, uid(7), '2026-11-06T12:00:00.000Z', idSeq(900));
  if (!r.ok || r.rooms.create.length !== 1)
    throw new Error('KP1 room: keepOutOfSquare did not create one room');
  return r.rooms.create[0]!;
}

describe('EZD-205b reconcile with closure overrides', () => {
  it('SY1 an override is kept while the gap is unchanged, and a bare gap makes no room', () => {
    const room = kp1Room();
    const objs: ModelObject[] = [...ROW2, room];
    expect(reconcileRooms(objs, F1, neverCalled()), '(a)').toEqual(EMPTY);

    const moved = moveWall(objs, uid(2), { x: 6, y: 0 });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    const b = reconcileRooms(applyChanged(objs, moved.changed), F1, neverCalled());
    expect(b.update, '(b)').toHaveLength(1);
    const u = b.update[0]!;
    expect(u.id).toBe(room.id);
    expect(u.data.attributes.name).toBe(room.data.attributes.name);
    expect(u.data.closureOverride).toEqual(room.data.closureOverride);
    expect(roomAreaSqFt(u.data.geometry.boundary)).toBe(125);

    expect(reconcileRooms(ROW2, F1, neverCalled()), '(c)').toEqual(EMPTY);
  });

  it('SY2 a changed gap clears the override and keeps the room', () => {
    const room = kp1Room();
    const r = reconcileRooms([...row2Ending(P(0, 0.25)), room], F1, neverCalled());
    expect(r.delete).toEqual([]);
    expect(r.update).toHaveLength(1);
    const u = r.update[0]!;
    expect(u.id).toBe(room.id);
    expect(u.data.attributes.name).toBe(room.data.attributes.name);
    expect(u.data.closureOverride).toBeNull();
    expect(outlineAreaSqIn(u.data.geometry.boundary)).toBeCloseTo(17280, 6);
  });

  it('SY3 a closed or broken chain, and the 1/64" gap comparison', () => {
    const room = kp1Room();

    const a = reconcileRooms([...row2Ending(P(0, 0)), room], F1, neverCalled());
    expect(a.update, '(a)').toHaveLength(1);
    expect(a.update[0]!.id).toBe(room.id);
    expect(a.update[0]!.data.closureOverride).toBeNull();
    expect(roomAreaSqFt(a.update[0]!.data.geometry.boundary)).toBe(120);

    const b = reconcileRooms([...ROW2.slice(0, 3), room], F1, neverCalled());
    expect(b.delete, '(b)').toEqual([uid(900)]);

    const c = reconcileRooms([...row2Ending(P(0, 0.515625)), room], F1, neverCalled());
    expect(c.delete, '(c)').toEqual([]);
    expect(
      [...c.create, ...c.update].filter((x) => x.data.closureOverride === null),
      '(c)',
    ).toEqual([]);

    const d = reconcileRooms([...row2Ending(P(0, 0.53125)), room], F1, neverCalled());
    expect(d.update, '(d)').toHaveLength(1);
    expect(d.update[0]!.id).toBe(room.id);
    expect(d.update[0]!.data.closureOverride).toBeNull();
  });
});

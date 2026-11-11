// EZD-235 M1-M5 (vault/plans/EZD-235.md section 4): the model binding of the derived cache. Expected values are the
// plan's rows (09j Room area rows 9-10, Moving a wall row 1; Q-0568). The middle dot is written as its escape (L-042).
import { CURRENT_SCHEMA_VERSION, type Point, type RoomObject } from '@ezdraft/geometry';
import { describe, expect, test } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { benchmarkObjects } from '../../app/dev/benchmark-plan/benchmark-objects';
import { createModelStore } from '../model/model-store';
import { openFloorId, planDrawingList } from '../plan/batches';
import { F1, withWalls } from '../tools/test-utils/fixtures';
import { createModelDerived, objectsSource, type ParsedObjects } from './model-derived';
import {
  EAST_ROOM,
  EAST_WALL,
  PARTITION,
  WEST_ROOM,
  label,
  moveChanges,
  renamed,
  twoRoomObjects,
} from './test-utils/two-room';

const p = (x: number, y: number): Point => ({ x, y });
const FA = 'abcdef12-3456-4abc-8def-0123456789ab';
const room = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

describe('EZD-235 model derived', () => {
  const setup = (objects = twoRoomObjects()) => {
    const store = createModelStore({ objects });
    const d = createModelDerived(store);
    const list = () => planDrawingList(store.getState().objects, { roomAreaSqFt: d.roomAreaSqFt });
    return { store, d, list };
  };

  test("EZD-235 M1 done when: moving the east wall recomputes the east room's area only", () => {
    const { store, d, list } = setup();
    const first = list();
    expect(d.stats().computes).toEqual({ 'room-area': 2 });
    expect(label(first, WEST_ROOM)).toBe('ROOM 1 \u00b7 48 SF');
    expect(label(first, EAST_ROOM)).toBe('ROOM 2 \u00b7 68 SF');
    store.applyEdit(moveChanges(store.getState().objects, EAST_WALL, { x: 6, y: 0 }));
    const second = list();
    expect(d.stats().computes).toEqual({ 'room-area': 3 });
    expect(d.stats().hits['room-area']).toBe(1);
    expect(label(second, WEST_ROOM)).toBe('ROOM 1 \u00b7 48 SF');
    expect(label(second, EAST_ROOM)).toBe('ROOM 2 \u00b7 73 SF');
  });

  test('EZD-235 M2 moving the partition recomputes both rooms', () => {
    const { store, d, list } = setup();
    list();
    expect(d.stats().computes).toEqual({ 'room-area': 2 });
    store.applyEdit(moveChanges(store.getState().objects, PARTITION, { x: 6, y: 0 }));
    const after = list();
    expect(d.stats().computes).toEqual({ 'room-area': 4 });
    expect(label(after, WEST_ROOM)).toBe('ROOM 1 \u00b7 53 SF');
    expect(label(after, EAST_ROOM)).toBe('ROOM 2 \u00b7 63 SF');
  });

  test("EZD-235 M3 only the open floor's rooms are computed, and a change elsewhere computes nothing", () => {
    const bench = benchmarkObjects();
    const open = openFloorId(bench)!.toLowerCase();
    const rooms = [...bench].filter(([, v]) => v.type === 'room');
    const levelOf = (v: ObjectValue) => String(v.data.level).toLowerCase();
    const [openId, openValue] = rooms.find(([, v]) => levelOf(v) === open)!;
    const [otherId, otherValue] = rooms.find(([, v]) => levelOf(v) !== open)!;
    const { store, d, list } = setup(bench);
    const snap = () => {
      const s = d.stats();
      return [s.computes['room-area'], s.hits['room-area'] ?? 0, s.entries];
    };
    list();
    expect(snap()).toEqual([360, 0, 360]);
    list();
    expect(snap()).toEqual([360, 360, 360]);
    store.applyEdit([{ id: otherId, value: renamed(otherValue, 'Other') }]);
    list();
    expect(snap()).toEqual([360, 720, 360]);
    store.applyEdit([{ id: openId, value: renamed(openValue, 'Open') }]);
    list();
    expect(snap()).toEqual([361, 1079, 360]);
  });

  test('EZD-235 M4 no view asking means no compute, and a swap without lastChangedIds is seen', () => {
    const { store, d, list } = setup();
    store.applyEdit([
      { id: WEST_ROOM, value: renamed(store.getState().objects.get(WEST_ROOM)!, 'West') },
    ]);
    store.applyEdit([
      { id: EAST_ROOM, value: renamed(store.getState().objects.get(EAST_ROOM)!, 'East') },
    ]);
    store.applyEdit([
      { id: WEST_ROOM, value: renamed(store.getState().objects.get(WEST_ROOM)!, 'West 2') },
    ]);
    expect(d.stats()).toEqual({ computes: {}, hits: {}, entries: 0 });
    list();
    expect(d.stats().computes).toEqual({ 'room-area': 2 });
    const objects = new Map(store.getState().objects);
    objects.set(EAST_ROOM, renamed(objects.get(EAST_ROOM)!, 'Den'));
    store.setState({ objects });
    const after = list();
    expect(d.stats().computes).toEqual({ 'room-area': 3 });
    expect(label(after, EAST_ROOM)).toBe('DEN \u00b7 68 SF');
  });

  test('EZD-235 M5 objectsSource parses once per value and id and lists by floor', () => {
    const M = new Map<string, ObjectValue>([
      [WEST_ROOM, twoRoomObjects().get(WEST_ROOM)!],
      [room(30), { type: 'room', schemaVersion: CURRENT_SCHEMA_VERSION, data: {} }],
      ...withWalls(new Map(), 31, [p(0, 0), p(144, 0)], false, 'right', FA),
      ...withWalls(new Map(), 32, [p(0, 120), p(144, 120)], false, 'right', FA.toUpperCase()),
    ]);
    const parsed: ParsedObjects = new WeakMap();
    const s1 = objectsSource(M, parsed);
    const s2 = objectsSource(new Map(M), parsed);
    const s3 = objectsSource(new Map([[room(40), M.get(WEST_ROOM)!]]), parsed);
    expect(s1.object(room(30))).toBeNull();
    expect(s1.object(WEST_ROOM.toUpperCase())).toBeNull();
    expect(s1.objectsOf('wall', FA)).toHaveLength(2);
    expect(s1.objectsOf('wall', FA) === s1.objectsOf('wall', FA)).toBe(true);
    expect(s1.objectsOf('floor' as never, F1)).toHaveLength(0);
    expect(s1.object(WEST_ROOM) === s2.object(WEST_ROOM)).toBe(true);
    expect(s3.object(room(40))!.id).toBe(room(40));

    const d = createModelDerived(createModelStore({ objects: twoRoomObjects() }));
    const lone: RoomObject = {
      id: room(50),
      type: 'room',
      data: {
        geometry: { boundary: [p(0, 0), p(144, 0), p(144, 120), p(0, 120)] },
        status: 'existing',
        level: F1,
        attributes: { name: 'Lone' },
        closureOverride: null,
      },
    };
    expect(d.roomAreaSqFt(lone)).toBe(120);
    expect(d.stats().computes).toEqual({});
  });
});

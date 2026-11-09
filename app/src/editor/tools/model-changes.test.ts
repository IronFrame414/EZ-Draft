// EZD-210a M1-M2 (vault/plans/EZD-210a.md sections 1 Decided "toModelObjects", "wallEditChanges",
// "wallChange / roomChanges", 3 C10-C14, 4). Sources: P120b `Change`; P205a reconcile; P202 `parseStoredObject`;
// SPLIT (v4 ids); AC-EZD-210-2, -3.
import {
  CURRENT_SCHEMA_VERSION,
  NO_NUMBERS,
  createOpeningData,
  createWallData,
  type Point,
  type WallObject,
} from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { createModelStore } from '../model/model-store';
import {
  initialRoomRectState,
  newObjectId,
  reduceRoomRect,
  toModelObjects,
  wallEditChanges,
  type ToolContext,
  type ToolInput,
} from './index';
import {
  F1,
  F2,
  baseObjects,
  drawWithRect,
  drawWithWall,
  idSeq,
  roomValue,
  typedEnws,
  uid,
  wallsOf,
  withWalls,
} from './test-utils/fixtures';

const p = (x: number, y: number): Point => ({ x, y });
const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function wallOn(level: string) {
  const r = createWallData({ start: p(0, 0), end: p(144, 0), level });
  if (!r.ok) throw new Error('createWallData refused the test wall');
  return r.data;
}

// The R2 rectangle: corner (0,0), typed 144 x 120 (ids uid(1)..uid(4)).
function r2Walls(): WallObject[] {
  const ctx: ToolContext = {
    level: F1,
    newId: idSeq(1),
    objects: toModelObjects(baseObjects(), F1),
  };
  const inputs: ToolInput[] = [
    { type: 'press', at: p(0, 0) },
    { type: 'release', at: p(0, 0) },
    { type: 'typed', values: { width: 144, depth: 120 } },
  ];
  let state = initialRoomRectState();
  let walls: WallObject[] = [];
  for (const input of inputs) {
    const step = reduceRoomRect(state, input, ctx);
    state = step.state;
    walls = step.walls;
  }
  return walls;
}

describe('EZD-210a model changes', () => {
  it('EZD-210a M1 changes for walls and rooms', () => {
    const data = wallOn(F1);
    const one: WallObject = { id: uid(1), type: 'wall', data };
    expect(wallEditChanges(baseObjects(), F1, [one], idSeq(9), NO_NUMBERS)).toEqual([
      {
        id: uid(1),
        value: {
          type: 'wall',
          schemaVersion: CURRENT_SCHEMA_VERSION,
          data: { ...data, attributes: { ...data.attributes, number: 1 } },
        },
      },
    ]);
    expect(wallEditChanges(baseObjects(), F1, [], idSeq(9), NO_NUMBERS)).toEqual([]);
    const walls = r2Walls();
    expect(walls.map((w) => w.id)).toEqual([uid(1), uid(2), uid(3), uid(4)]);
    const changes = wallEditChanges(baseObjects(), F1, walls, idSeq(5), NO_NUMBERS);
    expect(changes).toHaveLength(5);
    expect(changes.slice(0, 4).map((c) => c.id)).toEqual([uid(1), uid(2), uid(3), uid(4)]);
    for (const c of changes.slice(0, 4)) {
      expect(c.value?.type).toBe('wall');
      expect(c.value?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    }
    expect(changes[4]!.id).toBe(uid(5));
    expect(changes[4]!.value?.type).toBe('room');
    expect(changes[4]!.value?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const a = newObjectId();
    const b = newObjectId();
    expect(a).toMatch(V4);
    expect(b).toMatch(V4);
    expect(a).not.toBe(b);
  });

  it('EZD-210a M2 toModelObjects keeps what the edit reads', () => {
    const wallF1 = wallOn(F1);
    const noLayers = wallOn(F1) as unknown as { attributes: Record<string, unknown> };
    delete noLayers.attributes.layers;
    const boundary = [p(0, 0), p(144, 0), p(144, 120), p(0, 120)];
    const room = roomValue(boundary, 'Room 1', null, F2);
    const objects = new Map<string, ObjectValue>(baseObjects());
    const asValue = (d: unknown): ObjectValue => ({
      type: 'wall',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: d as Record<string, unknown>,
    });
    objects.set(uid(1), asValue(wallF1));
    objects.set(uid(2), asValue(wallOn(F2)));
    objects.set(uid(3), room);
    objects.set(uid(4), { type: 'opening', schemaVersion: 3, data: {} });
    objects.set(uid(5), { ...asValue(wallOn(F1)), schemaVersion: 99 });
    objects.set(uid(6), asValue(noLayers));
    const snapshot = structuredClone([...objects]);
    const got = toModelObjects(objects, F1);
    expect(got).toEqual([
      { id: uid(1), type: 'wall', data: wallF1 },
      { id: uid(3), type: 'room', data: room.data },
    ]);
    expect(objects.size).toBe(7);
    expect([...objects]).toEqual(snapshot);
  });
});

// EZD-294 T1-T4 (vault/plans/EZD-294.md section 4; Decided "wallEditChanges numbers"; AC-EZD-294-1, -3).
const numberOf = (v: { data: Record<string, unknown> } | null | undefined): unknown =>
  (v?.data.attributes as Record<string, unknown> | undefined)?.number;

function numbered(id: number, n: number | undefined): ObjectValue {
  const w = withWalls(baseObjects(), id, [p(0, 0), p(144, 0)], false).get(uid(id))!;
  if (n === undefined) return w;
  const d = w.data as { attributes: Record<string, unknown> };
  return { ...w, data: { ...w.data, attributes: { ...d.attributes, number: n } } };
}

describe('EZD-294 object numbers in wall edits', () => {
  it('EZD-294 T1 the Room rectangle numbers its four walls', () => {
    const got = drawWithRect(
      baseObjects(),
      [
        { type: 'press', at: p(0, 0) },
        { type: 'release', at: p(0, 0) },
        { type: 'typed', values: { width: 144, depth: 120 } },
      ],
      1,
    );
    const byId = new Map(wallsOf(got.objects).map((w) => [w.id, w]));
    expect([1, 2, 3, 4].map((k) => byId.get(uid(k))!.data.attributes.number)).toEqual([1, 2, 3, 4]);
    const room = got.objects.get(uid(5))!;
    expect(room.type).toBe('room');
    expect('number' in (room.data.attributes as Record<string, unknown>)).toBe(false);
  });

  it('EZD-294 T2 the Wall tool numbers each wall and keeps them when the chain closes', () => {
    const got = drawWithWall(baseObjects(), typedEnws([144, 120, 144, 120]), 1);
    const byId = new Map(wallsOf(got.objects).map((w) => [w.id, w]));
    expect([1, 2, 3, 4].map((k) => byId.get(uid(k))!.data.attributes.number)).toEqual([1, 2, 3, 4]);
    for (const step of got.changes) {
      for (const c of step) {
        if (c.value?.type !== 'wall') continue;
        const k = parseInt(c.id.slice(-12), 16);
        expect(numberOf(c.value)).toBe(k);
      }
    }
  });

  it('EZD-294 T3 a wall already saved keeps its stored number', () => {
    const objects = new Map(baseObjects());
    objects.set(uid(1), numbered(1, 7));
    const moved = createWallData({ start: p(10, 0), end: p(154, 0), level: F1 });
    if (!moved.ok) throw new Error('createWallData refused the test wall');
    const wall: WallObject = { id: uid(1), type: 'wall', data: moved.data };
    const changes = wallEditChanges(objects, F1, [wall], idSeq(9), NO_NUMBERS);
    expect(numberOf(changes.find((c) => c.id === uid(1))!.value)).toBe(7);
  });

  it('EZD-294 T4 a new wall gets the highest + 1 from highs and objects', () => {
    const objects = new Map(baseObjects());
    objects.set(uid(1), numbered(1, 1));
    objects.set(uid(2), numbered(2, 2));
    objects.set(uid(3), numbered(3, 3));
    const fresh = createWallData({ start: p(0, 50), end: p(144, 50), level: F1 });
    if (!fresh.ok) throw new Error('createWallData refused the test wall');
    const wall: WallObject = { id: uid(20), type: 'wall', data: fresh.data };
    const high = wallEditChanges(objects, F1, [wall], idSeq(30), { wall: 9, door: 0, window: 0 });
    expect(numberOf(high.find((c) => c.id === uid(20))!.value)).toBe(10);
    const low = wallEditChanges(objects, F1, [wall], idSeq(30), NO_NUMBERS);
    expect(numberOf(low.find((c) => c.id === uid(20))!.value)).toBe(4);
  });
});

// EZD-204b M1, M2 (vault/plans/EZD-204b.md sections 3, 4; Decided "wallEditChanges"; AC-EZD-204-1, -12): a wall
// edit appends the opening host updates, in the same undo step.
function hostedDoorObjects(): Map<string, ObjectValue> {
  const objects = withWalls(baseObjects(), 1, [p(0, 0), p(144, 0), p(144, 120), p(0, 120)], true);
  const host = toModelObjects(objects, F1).find((o) => o.id === uid(1));
  if (host === undefined || host.type !== 'wall') throw new Error('wall uid(1) missing');
  objects.set(uid(50), {
    type: 'opening',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: createOpeningData({ kind: 'door', host, center: p(72, 0) }) as unknown as Record<
      string,
      unknown
    >,
  });
  return objects;
}

function movedW1(): WallObject[] {
  const r = createWallData({ start: p(0, -6), end: p(144, -6), level: F1 });
  if (!r.ok) throw new Error('createWallData refused the test wall');
  return [{ id: uid(1), type: 'wall', data: r.data }];
}

describe('EZD-204b opening hosting', () => {
  it('EZD-204b M1 a wall edit flags its door in the same undo step', () => {
    const objects = hostedDoorObjects();
    const changes = wallEditChanges(objects, F1, movedW1(), idSeq(100), NO_NUMBERS);
    expect(changes[0]!.id).toBe(uid(1));
    const door = changes.filter((c) => c.id === uid(50));
    expect(door).toHaveLength(1);
    expect(door[0]!.value!.data.geometry).toEqual({
      center: { x: 72, y: 0 },
      hostWallId: null,
      axis: { x: 1, y: 0 },
    });

    const store = createModelStore({ objects });
    store.applyEdit(changes);
    expect(store.getState().past.length).toBe(1);
    store.undo();
    const back = store.getState().objects.get(uid(50))!;
    expect((back.data.geometry as { hostWallId: unknown }).hostWallId).toBe(uid(1));
  });

  it('EZD-204b M2 bad and other-floor openings are skipped', () => {
    const objects = hostedDoorObjects();
    objects.set(uid(51), {
      type: 'opening',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: { level: F1 },
    });
    const good = objects.get(uid(50))!;
    objects.set(uid(52), { ...good, data: { ...good.data, level: F2 } });

    let changes: ReturnType<typeof wallEditChanges> = [];
    expect(() => {
      changes = wallEditChanges(objects, F1, movedW1(), idSeq(100), NO_NUMBERS);
    }).not.toThrow();
    const openings = changes.filter((c) => c.value?.type === 'opening');
    expect(openings.map((c) => c.id)).toEqual([uid(50)]);
    expect(changes.some((c) => c.id === uid(51) || c.id === uid(52))).toBe(false);
  });
});

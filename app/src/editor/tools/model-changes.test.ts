// EZD-210a M1-M2 (vault/plans/EZD-210a.md sections 1 Decided "toModelObjects", "wallEditChanges",
// "wallChange / roomChanges", 3 C10-C14, 4). Sources: P120b `Change`; P205a reconcile; P202 `parseStoredObject`;
// SPLIT (v4 ids); AC-EZD-210-2, -3.
import {
  CURRENT_SCHEMA_VERSION,
  createWallData,
  type Point,
  type WallObject,
} from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import {
  initialRoomRectState,
  newObjectId,
  reduceRoomRect,
  toModelObjects,
  wallEditChanges,
  type ToolContext,
  type ToolInput,
} from './index';
import { F1, F2, baseObjects, idSeq, roomValue, uid } from './test-utils/fixtures';

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
    expect(wallEditChanges(baseObjects(), F1, [one], idSeq(9))).toEqual([
      { id: uid(1), value: { type: 'wall', schemaVersion: CURRENT_SCHEMA_VERSION, data } },
    ]);
    expect(wallEditChanges(baseObjects(), F1, [], idSeq(9))).toEqual([]);
    const walls = r2Walls();
    expect(walls.map((w) => w.id)).toEqual([uid(1), uid(2), uid(3), uid(4)]);
    const changes = wallEditChanges(baseObjects(), F1, walls, idSeq(5));
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

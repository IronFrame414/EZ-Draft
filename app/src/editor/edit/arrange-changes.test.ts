// EZD-233 (AC-EZD-233-1 "A mirrored door swaps hand"; AC-EZD-233-2 "a saved group places again"; Q-0630 "Space flips
// swing only; Mirror swaps hand"; S03 Context menu; S03 Decisions "Set status ... Multi-select works for many objects
// at once"; vault/build/assumptions.md EZD-233): the context menu's model changes. Expected values are worked by hand
// from the fixture geometry (the 12' x 10' room: wall 1 from (0,0) to (144,0), the door at (72,0) on it).
import { CURRENT_SCHEMA_VERSION, parseStoredObject } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { createModelStore } from '../model/model-store';
import type { Change } from '../model/patches';
import { expandGroups } from '../selection/groups';
import {
  alignChanges,
  groupChanges,
  mirrorChanges,
  placeSavedGroup,
  savedGroupPayload,
  statusChanges,
  ungroupChanges,
  type ArrangeContext,
  type ArrangeResult,
} from './arrange-changes';
import { DOOR, F1, ROOM, dataOf, highs, idSeq, p, uid, withOpenings } from './test-utils/fixtures';

const ctx = (
  objects: ReadonlyMap<string, ObjectValue>,
  ids: string[],
  start = 80,
): ArrangeContext => ({
  objects,
  level: F1,
  ids,
  newId: idSeq(start),
  highs,
});

// Every value a command writes must read as the model (and the server) reads it.
const changesOf = (r: ArrangeResult): Change[] => {
  if (!r.ok) throw new Error(`refused ${r.messageKey}`);
  for (const c of r.changes) {
    if (c.value === null) continue;
    const parsed = parseStoredObject({
      id: c.id,
      type: c.value.type,
      schema_version: c.value.schemaVersion,
      data: c.value.data,
    });
    expect(parsed.ok, `${c.id} ${c.value.type} parses`).toBe(true);
  }
  return r.changes;
};
const valueFor = (changes: Change[], id: string) => {
  const c = changes.filter((x) => x.id === id);
  expect(c).toHaveLength(1);
  return c[0]!.value;
};

function fixture(center: { x: number; y: number }, axis: { x: number; y: number }): ObjectValue {
  return {
    type: 'fixture',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: {
      geometry: { center, axis },
      status: 'new',
      level: F1,
      attributes: { kind: 'lavatory', width: 20, depth: 18 },
    },
  };
}

function utility(point: { x: number; y: number }, serves: string | null): ObjectValue {
  return {
    type: 'utility_point',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: {
      geometry: { point },
      status: 'new',
      level: F1,
      attributes: { kind: 'water', volts: null, amps: null, servesObjectId: serves },
    },
  };
}

type Attrs = { hand: string | null; swing: string | null };

describe('EZD-233 Mirror', () => {
  it('AC-EZD-233-1 a mirrored door swaps hand, keeps its swing, wall and offset, in one undo step', () => {
    const objects = withOpenings(ROOM, 'door');
    const before = dataOf(DOOR);
    expect((before.attributes as Attrs).hand).toBe('left');
    const changes = changesOf(mirrorChanges(ctx(objects, [uid(50)])));
    expect(changes.map((c) => c.id)).toEqual([uid(50)]);
    const after = dataOf(valueFor(changes, uid(50)));
    expect((after.attributes as Attrs).hand).toBe('right');
    expect((after.attributes as Attrs).swing).toBe((before.attributes as Attrs).swing);
    expect(after.geometry.center).toEqual(p(72, 0));
    expect(after.geometry.hostWallId).toBe(uid(1));

    const store = createModelStore({ objects });
    store.applyEdit(changes);
    expect((dataOf(store.getState().objects.get(uid(50))).attributes as Attrs).hand).toBe('right');
    store.undo();
    expect((dataOf(store.getState().objects.get(uid(50))).attributes as Attrs).hand).toBe('left');

    // Mirrored twice, it is back to Hinge left.
    const again = changesOf(mirrorChanges(ctx(store.getState().objects, [uid(50)])));
    expect((dataOf(valueFor(again, uid(50))).attributes as Attrs).hand).toBe('right');
  });

  it('AC-EZD-233-1 a door mirrored with its wall swaps hand and stays on that wall', () => {
    const objects = withOpenings(ROOM, 'door');
    // Wall 1 (0,0)-(144,0) flips about x = 72 onto itself; the door at (72,0) stays at (72,0).
    const changes = changesOf(mirrorChanges(ctx(objects, [uid(1), uid(50)])));
    const wall = dataOf(valueFor(changes, uid(1)));
    expect(wall.geometry.start).toEqual(p(0, 0));
    expect(wall.geometry.end).toEqual(p(144, 0));
    const door = dataOf(valueFor(changes, uid(50)));
    expect((door.attributes as Attrs).hand).toBe('right');
    expect((door.attributes as Attrs).swing).toBe('left');
    expect(door.geometry.center).toEqual(p(72, 0));
    expect(door.geometry.hostWallId).toBe(uid(1));
  });

  it('EZD-233 a window has no hand and a mirror leaves it as it is', () => {
    const objects = withOpenings(ROOM, 'window');
    const changes = changesOf(mirrorChanges(ctx(objects, [uid(51)])));
    const w = dataOf(valueFor(changes, uid(51)));
    expect((w.attributes as Attrs).hand).toBeNull();
    expect(w.geometry.center).toEqual(p(144, 60));
  });

  it('EZD-233 a fixture and a utility point flip left to right about the middle of their box', () => {
    // Fixture 20 wide along x at (10,50): x from 0 to 20. Point at (100,50). Middle x = 50.
    const objects = new Map(ROOM)
      .set(uid(60), fixture(p(10, 50), p(1, 0)))
      .set(uid(61), utility(p(100, 50), null));
    const changes = changesOf(mirrorChanges(ctx(objects, [uid(60), uid(61)])));
    expect(dataOf(valueFor(changes, uid(60))).geometry).toEqual({
      center: p(90, 50),
      axis: p(1, 0),
    });
    expect(dataOf(valueFor(changes, uid(61))).geometry).toEqual({ point: p(0, 50) });

    // Width along y: 18 deep along x, so x from 1 to 19; point at (101,50); middle x = 51. Its back (to the left of
    // the axis, -x) moves to +x, so the axis turns to (0,-1).
    const turned = new Map(ROOM)
      .set(uid(60), fixture(p(10, 50), p(0, 1)))
      .set(uid(61), utility(p(101, 50), null));
    const c2 = changesOf(mirrorChanges(ctx(turned, [uid(60), uid(61)])));
    expect(dataOf(valueFor(c2, uid(60))).geometry).toEqual({ center: p(92, 50), axis: p(0, -1) });
    expect(dataOf(valueFor(c2, uid(61))).geometry).toEqual({ point: p(1, 50) });
  });

  it('EZD-233 nothing selected mirrors nothing', () => {
    expect(changesOf(mirrorChanges(ctx(ROOM, [])))).toEqual([]);
  });
});

describe('EZD-233 Align', () => {
  // Fixture box x 0..20, y 41..59; point (100,80).
  const objects = new Map(ROOM)
    .set(uid(60), fixture(p(10, 50), p(1, 0)))
    .set(uid(61), utility(p(100, 80), null));
  const sel = [uid(60), uid(61)];

  it('EZD-233 Align left moves each object to the leftmost edge', () => {
    const changes = changesOf(alignChanges(ctx(objects, sel), 'left'));
    expect(changes.map((c) => c.id)).toEqual([uid(61)]);
    expect(dataOf(valueFor(changes, uid(61))).geometry).toEqual({ point: p(0, 80) });
  });

  it('EZD-233 Align top moves each object to the highest edge on the plan', () => {
    const changes = changesOf(alignChanges(ctx(objects, sel), 'top'));
    expect(changes.map((c) => c.id)).toEqual([uid(60)]);
    expect(dataOf(valueFor(changes, uid(60))).geometry.center).toEqual(p(10, 71));
  });

  it('EZD-233 Align right and bottom', () => {
    const right = changesOf(alignChanges(ctx(objects, sel), 'right'));
    expect(dataOf(valueFor(right, uid(60))).geometry.center).toEqual(p(90, 50));
    const bottom = changesOf(alignChanges(ctx(objects, sel), 'bottom'));
    expect(dataOf(valueFor(bottom, uid(61))).geometry).toEqual({ point: p(100, 41) });
  });

  it('EZD-233 one object aligns to nothing', () => {
    expect(changesOf(alignChanges(ctx(objects, [uid(60)]), 'left'))).toEqual([]);
  });
});

describe('EZD-233 Set status', () => {
  it('EZD-233 sets one status on every selected object at once', () => {
    const objects = withOpenings(ROOM, 'door').set(uid(60), fixture(p(10, 50), p(1, 0)));
    const changes = changesOf(statusChanges(ctx(objects, [uid(1), uid(50), uid(60)]), 'demo'));
    expect(changes.map((c) => c.id).sort()).toEqual([uid(1), uid(50), uid(60)].sort());
    for (const c of changes) expect(dataOf(c.value).status).toBe('demo');
  });

  it('EZD-233 a bearing wall is not set to Demo here', () => {
    const w1 = ROOM.get(uid(1))!;
    const attrs = (w1.data as { attributes: Record<string, unknown> }).attributes;
    const objects = new Map(ROOM).set(uid(1), {
      ...w1,
      data: { ...w1.data, attributes: { ...attrs, bearing: true } },
    });
    expect(statusChanges(ctx(objects, [uid(1), uid(2)]), 'demo')).toEqual({
      ok: false,
      messageKey: 'office.edit.bearing_demo',
    });
    const asNew = changesOf(statusChanges(ctx(objects, [uid(1)]), 'new'));
    expect(dataOf(valueFor(asNew, uid(1))).status).toBe('new');
  });
});

describe('EZD-233 Group', () => {
  it('EZD-233 groups two or more objects, and a click on one takes them all', () => {
    const r = groupChanges(ctx(ROOM, [uid(1), uid(2)]));
    const changes = changesOf(r);
    expect(changes).toEqual([
      {
        id: uid(80),
        value: {
          type: 'group',
          schemaVersion: CURRENT_SCHEMA_VERSION,
          data: { level: F1, memberIds: [uid(1), uid(2)] },
        },
      },
    ]);
    const store = createModelStore({ objects: ROOM });
    store.applyEdit(changes);
    expect(expandGroups(store.getState().objects, [uid(2)])).toEqual([uid(2), uid(1)]);
    expect(expandGroups(store.getState().objects, [uid(3)])).toEqual([uid(3)]);
  });

  it('EZD-233 one object makes no group', () => {
    expect(changesOf(groupChanges(ctx(ROOM, [uid(1)])))).toEqual([]);
  });

  it('EZD-233 a member regrouped leaves its old group, which goes when one member is left; Ungroup removes it', () => {
    const first = createModelStore({ objects: ROOM });
    first.applyEdit(changesOf(groupChanges(ctx(ROOM, [uid(1), uid(2)]))));
    const grouped = first.getState().objects;
    const second = changesOf(groupChanges(ctx(grouped, [uid(2), uid(3)], 90)));
    expect(second.map((c) => c.id)).toEqual([uid(80), uid(90)]);
    expect(second[0]!.value).toBeNull();
    first.applyEdit(second);
    expect(expandGroups(first.getState().objects, [uid(1)])).toEqual([uid(1)]);
    expect(expandGroups(first.getState().objects, [uid(3)])).toEqual([uid(3), uid(2)]);

    const un = changesOf(ungroupChanges(ctx(first.getState().objects, [uid(3)])));
    expect(un).toEqual([{ id: uid(90), value: null }]);
  });

  it('EZD-233 a member no longer in the model reads as gone', () => {
    const store = createModelStore({ objects: withOpenings(ROOM, 'door') });
    store.applyEdit(changesOf(groupChanges(ctx(store.getState().objects, [uid(50), uid(2)]))));
    store.applyEdit([{ id: uid(50), value: null }]);
    expect(expandGroups(store.getState().objects, [uid(2)])).toEqual([uid(2)]);
  });
});

describe('EZD-233 Saved groups', () => {
  it('AC-EZD-233-2 a saved fixture and its utility point place again with new ids, centred on the click', () => {
    const objects = new Map(ROOM)
      .set(uid(60), fixture(p(10, 50), p(1, 0)))
      .set(uid(61), utility(p(30, 50), uid(60)));
    const payload = savedGroupPayload({ objects, level: F1, ids: [uid(60), uid(61), uid(5)] });
    expect(payload?.items.map((i) => i.type)).toEqual(['fixture', 'utility_point']);
    // Stored and read back as JSON, as the library keeps it.
    const stored = JSON.parse(JSON.stringify(payload));

    // Centre of (10,50) and (30,50) is (20,50); placed at (500,500) the two land at (490,500) and (510,500).
    const r = placeSavedGroup(ctx(ROOM, []), stored, p(500, 500));
    const changes = changesOf(r);
    expect(r.ok && r.ids).toEqual([uid(80), uid(81)]);
    const f = dataOf(valueFor(changes, uid(80)));
    expect(f.geometry.center).toEqual(p(490, 500));
    const u = dataOf(valueFor(changes, uid(81))) as unknown as {
      geometry: { point: unknown };
      attributes: { servesObjectId: string | null };
    };
    expect(u.geometry.point).toEqual(p(510, 500));
    expect(u.attributes.servesObjectId).toBe(uid(80));

    // Placed a second time, it is another copy.
    const again = changesOf(placeSavedGroup(ctx(ROOM, [], 90), stored, p(0, 300)));
    expect(again.map((c) => c.id)).toEqual([uid(90), uid(91)]);
  });

  it('AC-EZD-233-2 a saved wall with its door places again with the door on the new wall', () => {
    const objects = withOpenings(ROOM, 'door');
    const payload = savedGroupPayload({ objects, level: F1, ids: [uid(1), uid(50)] })!;
    // Centre of (0,0), (144,0) and (72,0) is (72,0); placed at (72,300).
    const store = createModelStore({ objects: ROOM });
    const r = placeSavedGroup(
      { objects: ROOM, level: F1, ids: [], newId: idSeq(80), highs },
      JSON.parse(JSON.stringify(payload)),
      p(72, 300),
    );
    const changes = changesOf(r);
    const wall = dataOf(valueFor(changes, uid(80)));
    expect(wall.geometry.start).toEqual(p(0, 300));
    expect(wall.geometry.end).toEqual(p(144, 300));
    const door = dataOf(valueFor(changes, uid(81)));
    expect(door.geometry.center).toEqual(p(72, 300));
    expect(door.geometry.hostWallId).toBe(uid(80));
    expect((door.attributes as Attrs).hand).toBe('left');

    store.applyEdit(changes);
    expect(store.getState().objects.has(uid(80))).toBe(true);
    store.undo();
    expect(store.getState().objects.has(uid(80))).toBe(false);
    expect(store.getState().objects.has(uid(81))).toBe(false);
  });

  it('EZD-233 nothing to save is null, and a payload of nothing placeable is refused', () => {
    expect(savedGroupPayload({ objects: ROOM, level: F1, ids: [uid(5)] })).toBeNull();
    expect(placeSavedGroup(ctx(ROOM, []), { items: [] }, p(0, 0))).toEqual({
      ok: false,
      messageKey: 'office.saved_groups.place_failed',
    });
  });
});

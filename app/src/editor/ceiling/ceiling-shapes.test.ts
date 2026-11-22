// EZD-513 Soffits, trays, coffers, crown, tags (AC-EZD-513-1 "A tag reads its text from the ceiling data and updates
// with it", AC-EZD-513-2 "A soffit, a tray, a coffer and crown each draw with edge dimensions and persist").
// Expected values: S05 Controls "Height and material tag ... (e.g. "CLG 8' 0" · ACT 2x2"). Tag reads from the ceiling
// data ... Tag text is generated, not free text", "Soffit, tray, coffer ... Draws a soffit, tray, coffer or crown;
// edges get dimensions"; board S05Ceiling tags "CLG 8' 0" · ...", "CLG 8' to 13' · drywall"; Q-0704 "soffit
// dropHeight is measured down from the room's ceiling height, which EZD-513's tag reads"; vault/build/assumptions.md
// EZD-511/EZD-513 row "EZD-513 builds height and finish only" and EZD-513 rows. The fixture room is 144" x 120" (tools
// test-utils) with an 8' 0" (96") ceiling by point; the shape is the 120" x 96" rectangle from (12, 12) to (132, 108),
// so its edges read 10' 0" and 8' 0" (plan rounding, 1/2").
import {
  CURRENT_SCHEMA_VERSION,
  parseStoredObject,
  type DrawingItem,
  type Point,
  type RoomCeiling,
} from '@ezdraft/geometry';
import { describe, expect, it, vi } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { createModelStore } from '../model/model-store';
import { planDrawingList } from '../plan/batches';
import type { PlanPointerEvent } from '../plan/input';
import { createPickIndex } from '../selection/pick-index';
import { ceilingAware } from '../tools/beam-tool';
import { DOOR, F1, roomValue, uid } from '../tools/test-utils/fixtures';
import {
  EDGE_DIMENSION_OFFSET_IN,
  placeCeilingShape,
  placeCeilingTag,
  tagText,
  type ShapeKind,
} from './ceiling-shapes';
import { rcpList } from './rcp';
import { createShapeDrawing, shapeDrawingFor, shapeReceiver, tagReceiver } from './shape-tool';
import { createSurfaceSetting } from './surface';

const P = (x: number, y: number): Point => ({ x, y });
const ROOM_ID = uid(60);
const SHAPE_ID = uid(81);
const TAG_ID = uid(82);
const OUTLINE = [P(12, 12), P(132, 12), P(132, 108), P(12, 108)];
const CORNERS = [P(0, 0), P(144, 0), P(144, 120), P(0, 120)];

function ceilingAt(height: number): RoomCeiling {
  return {
    heightsBy: 'point',
    wallHeights: [],
    pointHeights: CORNERS.map((at) => ({ at, height })),
    pitch: null,
    ridge: null,
  };
}

function room(
  ceiling: RoomCeiling = ceilingAt(96),
  type: 'flat' | 'vaulted' = 'flat',
): Map<string, ObjectValue> {
  const objects = new Map(DOOR);
  const r = roomValue(CORNERS, 'Family room', null);
  const data = r.data as { attributes: Record<string, unknown> };
  data.attributes = { ...data.attributes, ceilingType: type, ceiling };
  objects.set(ROOM_ID, r);
  return objects;
}

function withRoomCeiling(
  objects: Map<string, ObjectValue>,
  ceiling: RoomCeiling,
): Map<string, ObjectValue> {
  const next = new Map(objects);
  const r = structuredClone(next.get(ROOM_ID)!);
  (r.data as { attributes: Record<string, unknown> }).attributes.ceiling = ceiling;
  next.set(ROOM_ID, r);
  return next;
}

function add(
  objects: Map<string, ObjectValue>,
  kind: ShapeKind,
  depth: number,
): Map<string, ObjectValue> {
  const change = placeCeilingShape(objects, F1, kind, OUTLINE, depth, 'new', () => SHAPE_ID);
  expect(change).not.toBeNull();
  const next = new Map(objects);
  next.set(change!.id, change!.value!);
  return next;
}

function tagged(objects: Map<string, ObjectValue>, at: Point): Map<string, ObjectValue> {
  const change = placeCeilingTag(objects, F1, at, 'new', () => TAG_ID);
  expect(change).not.toBeNull();
  const next = new Map(objects);
  next.set(change!.id, change!.value!);
  return next;
}

const itemsOf = (objects: Map<string, ObjectValue>, id: string): DrawingItem[] =>
  rcpList(planDrawingList(objects, {}, null, null), objects)!.items.filter(
    (i) => i.objectId.toLowerCase() === id,
  );
const textsOf = (items: DrawingItem[]): string[] =>
  items.flatMap((i) => (i.kind === 'text' ? [i.text] : []));

const click = (model: Point, screen: Point = model): PlanPointerEvent => ({
  kind: 'click',
  model,
  screen,
  pointerType: 'mouse',
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
});

describe('EZD-513 AC-1 height and material tag', () => {
  it('reads the room ceiling height and material: "CLG 8\' 0" · drywall"', () => {
    expect(tagText(room(), F1, P(72, 60))).toBe(`CLG 8' 0" · drywall`);
  });

  it('a vaulted room reads low to high, as the board: "CLG 8\' to 13\' · drywall"', () => {
    const vault: RoomCeiling = {
      ...ceilingAt(96),
      ridge: { start: P(0, 60), end: P(144, 60), height: 156 },
    };
    expect(tagText(room(vault, 'vaulted'), F1, P(72, 60))).toBe(`CLG 8' to 13' · drywall`);
  });

  it('inside a soffit reads the room height less its drop; a tray adds its rise, a coffer its depth', () => {
    expect(tagText(add(room(), 'soffit', 12), F1, P(72, 60))).toBe(`CLG 7' 0" · drywall`);
    expect(tagText(add(room(), 'tray', 12), F1, P(72, 60))).toBe(`CLG 9' 0" · drywall`);
    expect(tagText(add(room(), 'coffer', 6), F1, P(72, 60))).toBe(`CLG 8' 6" · drywall`);
    // Crown is trim, not an area: the room's height.
    expect(tagText(add(room(), 'crown', 4), F1, P(72, 60))).toBe(`CLG 8' 0" · drywall`);
    // Outside the soffit: the room's height.
    expect(tagText(add(room(), 'soffit', 12), F1, P(6, 6))).toBe(`CLG 8' 0" · drywall`);
  });

  it('stores no text, and the drawn tag updates when the ceiling data changes', () => {
    const before = tagged(room(), P(72, 60));
    const stored = before.get(TAG_ID)!;
    expect(stored.data).toEqual({
      geometry: { point: P(72, 60) },
      status: 'new',
      level: F1,
      attributes: {},
    });
    expect(textsOf(itemsOf(before, TAG_ID))).toEqual([`CLG 8' 0" · drywall`]);
    // The room's ceiling is raised to 9' 0"; the tag object is not touched.
    const raised = withRoomCeiling(before, ceilingAt(108));
    expect(raised.get(TAG_ID)).toEqual(stored);
    expect(textsOf(itemsOf(raised, TAG_ID))).toEqual([`CLG 9' 0" · drywall`]);
    // A soffit drawn over the tag, then its drop changed: the tag follows each.
    const soffit = add(raised, 'soffit', 12);
    expect(textsOf(itemsOf(soffit, TAG_ID))).toEqual([`CLG 8' 0" · drywall`]);
    const deeper = new Map(soffit);
    const s = structuredClone(deeper.get(SHAPE_ID)!);
    (s.data as { attributes: { dropHeight: number } }).attributes.dropHeight = 18;
    deeper.set(SHAPE_ID, s);
    expect(textsOf(itemsOf(deeper, TAG_ID))).toEqual([`CLG 7' 6" · drywall`]);
  });

  it('the tag tool places a tag in a room and selects it; outside a room it says so', () => {
    const store = createModelStore({ objects: room() });
    const select = vi.fn();
    const onMessage = vi.fn();
    const receive = tagReceiver({
      store,
      chosenFloor: () => null,
      newStatus: () => 'new',
      newId: () => TAG_ID,
      select,
      onMessage,
    });
    receive(click(P(500, 500)));
    expect(onMessage).toHaveBeenCalledWith('office.ceiling.tag.click_room');
    expect(store.getState().objects.has(TAG_ID)).toBe(false);
    receive(click(P(72, 60)));
    expect(select).toHaveBeenCalledWith([TAG_ID]);
    expect(store.getState().objects.get(TAG_ID)!.type).toBe('ceiling_tag');
    store.undo();
    expect(store.getState().objects.has(TAG_ID)).toBe(false);
  });
});

describe('EZD-513 AC-2 soffit, tray, coffer and crown', () => {
  for (const [kind, type, attributes] of [
    ['soffit', 'soffit', { dropHeight: 12 }],
    ['tray', 'ceiling_shape', { kind: 'tray', depth: 12 }],
    ['coffer', 'ceiling_shape', { kind: 'coffer', depth: 12 }],
    ['crown', 'ceiling_shape', { kind: 'crown', depth: 12 }],
  ] as const) {
    it(`a ${kind} draws its outline with a dimension on every edge and persists`, () => {
      const objects = add(room(), kind, 12);
      const saved = objects.get(SHAPE_ID)!;
      expect(saved.type).toBe(type);
      const parsed = parseStoredObject({
        id: SHAPE_ID,
        type: saved.type,
        schema_version: saved.schemaVersion,
        data: structuredClone(saved.data),
      });
      expect(parsed.ok).toBe(true);
      expect((saved.data as { attributes: unknown }).attributes).toEqual(attributes);
      expect((saved.data as { geometry: { boundary: Point[] } }).geometry.boundary).toEqual(
        OUTLINE,
      );

      const items = itemsOf(objects, SHAPE_ID);
      expect(items.some((i) => i.kind === 'line' && i.layer === 'new')).toBe(true);
      expect(textsOf(items).sort()).toEqual([`10' 0"`, `10' 0"`, `8' 0"`, `8' 0"`]);
      const dims = items.filter((i) => i.kind === 'line' && i.layer === 'dimensions');
      expect(dims).toHaveLength(4);
      // Each dimension line is the offset outside its edge: the bottom edge (y 12) reads at y 6, the top at y 114.
      const ys = dims
        .flatMap((d) => (d.kind === 'line' && d.from.y === d.to.y ? [d.from.y] : []))
        .sort((a, b) => a - b);
      expect(ys).toEqual([12 - EDGE_DIMENSION_OFFSET_IN, 108 + EDGE_DIMENSION_OFFSET_IN]);
    });
  }

  it('the tool draws by clicks, closes on the first corner, saves the chosen kind and size, and selects it', () => {
    const store = createModelStore({ objects: room() });
    const drawing = createShapeDrawing();
    const select = vi.fn();
    const onMessage = vi.fn();
    const receive = shapeReceiver({
      store,
      drawing,
      chosenFloor: () => null,
      newStatus: () => 'new',
      newId: () => SHAPE_ID,
      select,
      onMessage,
    });
    receive(click(P(500, 500)));
    expect(onMessage).toHaveBeenCalledWith('office.ceiling.shape.click_room');
    drawing.setKind('tray');
    drawing.setDepth('tray', 10);
    for (const p of OUTLINE) receive(click(p));
    expect(store.getState().objects.has(SHAPE_ID)).toBe(false);
    receive(click(P(15, 15), P(15, 15)));
    expect(drawing.get().points).toEqual([]);
    expect(select).toHaveBeenCalledWith([SHAPE_ID]);
    expect(store.getState().objects.get(SHAPE_ID)!.data).toEqual({
      geometry: { roomId: ROOM_ID, boundary: OUTLINE },
      status: 'new',
      level: F1,
      attributes: { kind: 'tray', depth: 10 },
    });
    store.undo();
    expect(store.getState().objects.has(SHAPE_ID)).toBe(false);
  });

  it('a soffit starts with the 12" drop (EZD-229), and a surface change drops a half-drawn outline', () => {
    const surface = createSurfaceSetting('ceiling');
    surface.setTool('soffit');
    const drawing = shapeDrawingFor(surface);
    expect(shapeDrawingFor(surface)).toBe(drawing);
    expect(drawing.get()).toMatchObject({ kind: 'soffit', depths: { soffit: 12 } });
    drawing.start(P(12, 12), P(12, 12));
    surface.setTool(null);
    expect(drawing.get().points).toEqual([]);
  });

  it('a tray, coffer or crown and a tag can be picked, so they can be selected and deleted', () => {
    const objects = tagged(add(room(), 'tray', 12), P(72, 60));
    const index = createPickIndex();
    index.sync(objects, F1, [...objects.keys()]);
    expect(index.pick(P(72, 60), 1)).toContain(TAG_ID);
    expect(index.pick(P(20, 100), 1)).toContain(SHAPE_ID);
  });

  it('on the Floor surface a tray, coffer, crown or tag is not picked; a soffit, drawn there, still is', () => {
    const surface = createSurfaceSetting('floor');
    const base = { version: () => 1, shown: () => true, subscribe: () => () => {} };
    for (const type of ['ceiling_shape', 'ceiling_tag'])
      expect(ceilingAware(base, surface).shownObject!(type, 'new')).toBe(false);
    expect(ceilingAware(base, surface).shownObject!('soffit', 'new')).toBe(true);
    const objects = tagged(add(room(), 'tray', 12), P(72, 60));
    const index = createPickIndex();
    index.sync(objects, F1, [...objects.keys()], ceilingAware(base, surface));
    expect(index.pick(P(72, 60), 1)).not.toContain(TAG_ID);
    expect(index.pick(P(20, 100), 1)).not.toContain(SHAPE_ID);
    surface.setSurface('ceiling');
    for (const type of ['ceiling_shape', 'ceiling_tag'])
      expect(ceilingAware(base, surface).shownObject!(type, 'new')).toBe(true);
    index.sync(objects, F1, [...objects.keys()], ceilingAware(base, surface));
    expect(index.pick(P(72, 60), 1)).toContain(TAG_ID);
    expect(index.pick(P(20, 100), 1)).toContain(SHAPE_ID);
  });

  it('refuses an outline whose first corner is in no room', () => {
    expect(
      placeCeilingShape(
        room(),
        F1,
        'tray',
        [P(500, 500), P(600, 500), P(600, 600)],
        12,
        'new',
        () => SHAPE_ID,
      ),
    ).toBeNull();
    expect(CURRENT_SCHEMA_VERSION).toBe(7);
  });
});

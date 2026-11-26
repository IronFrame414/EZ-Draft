// EZD-216 (AC-EZD-216-1, -2, -4, -5, -8). Expected values: 09m Dimensions rows 1 to 8 and Text paper size rows 1 to
// 5; 09-calculations Q-0664 (1/64" places nothing, no 200' limit, whole degrees half up, inside bounding box, outer
// wall extents, screen = paper × 96 × zoom, model = paper × 12 ÷ scale); 03 Q-0667 (an auto room dimension takes its
// room's status, the overall one is Existing); Q-0686 case 2 (a) (a wall-face dimension goes with its wall).
import { describe, expect, it } from 'vitest';
import { createDerivedCache, type DerivedSource } from '../derived/derived';
import { buildDrawingList } from '../drawing/build';
import type { DrawingItem } from '../drawing/types';
import type { DimensionData, ModelObject, TextData } from '../schema';
import { newRoomAttributes } from '../schema/room';
import { ID, LEVEL_1, LEVEL_2, roomWalls, wallObj } from '../walls/test-utils/fixtures';
import type { WallObject } from '../walls/wall';
import {
  AUTO_OVERALL_OFFSET_IN,
  AUTO_ROOM_OFFSET_IN,
  autoDimensionChanges,
  FLOOR_WALL_BOX,
  ROOM_INSIDE_BOX,
  roomInsideBox,
  wallsOuterBox,
} from './auto';
import {
  angularMeasure,
  dimensionText,
  formatAngle,
  formatDimensionLength,
  linearMeasure,
  measureDimension,
  measuredText,
  offsetThrough,
  type DimensionObject,
} from './measure';
import { paperModelIn, paperScreenPx, PX_PER_PAPER_IN } from './paper';
import { PAPER_SIZE_IN } from '../schema/text';

type RoomObject = Extract<ModelObject, { type: 'room' }>;
const ROOM = '00000000-0000-4000-8000-0000000000c1';
const ROOM2 = '00000000-0000-4000-8000-0000000000c2';
const DIM = '00000000-0000-4000-8000-0000000000d1';
const TXT = '00000000-0000-4000-8000-0000000000e1';

function room(
  id: string,
  w: number,
  d: number,
  status: RoomObject['data']['status'] = 'existing',
  level = LEVEL_1,
): RoomObject {
  return {
    id,
    type: 'room',
    data: {
      geometry: {
        boundary: [
          { x: 0, y: 0 },
          { x: w, y: 0 },
          { x: w, y: d },
          { x: 0, y: d },
        ],
      },
      status,
      level,
      attributes: newRoomAttributes('Kitchen'),
      closureOverride: null,
    },
  };
}

const withThickness = (walls: WallObject[], t: number): WallObject[] =>
  walls.map((w) => ({
    ...w,
    data: { ...w.data, attributes: { ...w.data.attributes, thickness: t } },
  }));

function pointsDim(from: { x: number; y: number }, to: { x: number; y: number }): DimensionData {
  return {
    geometry: { kind: 'points', from, to },
    status: 'new',
    level: LEVEL_1,
    attributes: { kind: 'linear', offset: 0, override: null, auto: null, room: null },
  };
}

const NO_LOOKUP = { wall: () => null, roomBox: () => null, floorBox: () => null };

let seq = 0;
const newId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

describe('EZD-216 09m Dimensions rows 1 to 4: linear, 1/2" precision, no 200 ft limit (AC-1)', () => {
  it('row 1: two points 0" apart, or within 1/64", place nothing', () => {
    expect(linearMeasure({ x: 10, y: 10 }, { x: 10, y: 10 })).toBeNull();
    expect(linearMeasure({ x: 0, y: 0 }, { x: 1 / 64, y: 0 })).toBeNull();
    expect(measureDimension(pointsDim({ x: 5, y: 5 }, { x: 5, y: 5 }), NO_LOOKUP)).toBeNull();
  });

  it('rows 2 to 4: 150" reads 12\' 6", 2400" reads 200\' 0", 3000" reads 250\' 0"', () => {
    const at = (len: number) =>
      measuredText(measureDimension(pointsDim({ x: 0, y: 0 }, { x: len, y: 0 }), NO_LOOKUP)!);
    expect(at(150)).toBe(`12' 6"`);
    expect(at(2400)).toBe(`200' 0"`);
    expect(at(3000)).toBe(`250' 0"`);
    expect(formatDimensionLength(141.5)).toBe(`11' 9 1/2"`);
  });

  it('a wall-face dimension measures the face and follows the wall', () => {
    const w = wallObj(ID.W1, { x: 0, y: 0 }, { x: 150, y: 0 }, { thicknessSide: 'left' });
    const d: DimensionData = {
      ...pointsDim({ x: 0, y: 0 }, { x: 1, y: 0 }),
      geometry: { kind: 'wall_face', wallId: ID.W1, face: 'left' },
    };
    const look = (wall: WallObject) => ({ ...NO_LOOKUP, wall: () => wall });
    const m = measureDimension(d, look(w));
    expect(m && measuredText(m)).toBe(`12' 6"`);
    // The left face is the thickness away on the left (+y), and the line's outward normal points away from the wall.
    expect(m?.kind === 'linear' && m.from.y).toBe(w.data.attributes.thickness);
    expect(m?.kind === 'linear' && m.normal).toEqual({ x: -0, y: 1 });
    const moved = { ...w, data: { ...w.data, geometry: { ...w.data.geometry, end: { x: 168, y: 0 } } } };
    expect(measuredText(measureDimension(d, look(moved))!)).toBe(`14' 0"`);
    expect(measureDimension(d, NO_LOOKUP)).toBeNull();
  });

  it('the offset through a point is its distance along the outward normal', () => {
    const m = linearMeasure({ x: 0, y: 0 }, { x: 100, y: 0 })!;
    expect(offsetThrough(m, { x: 40, y: 18 })).toBe(18);
    expect(offsetThrough(m, { x: 40, y: -6 })).toBe(-6);
  });
});

describe('EZD-216 09m Dimensions rows 5 to 7: angular, whole degrees half up (AC-2)', () => {
  it('row 5: walls at 90° read 90°', () => {
    const m = angularMeasure(
      { start: { x: 0, y: 0 }, end: { x: 120, y: 0 } },
      { start: { x: 0, y: 0 }, end: { x: 0, y: 120 } },
      { x: 30, y: 30 },
    );
    expect(m).not.toBeNull();
    expect(formatAngle(m!.degrees)).toBe('90°');
    expect(m!.vertex).toEqual({ x: 0, y: 0 });
    expect(m!.radius).toBeCloseTo(Math.hypot(30, 30), 9);
  });

  it('rows 6 and 7: 87.5° reads 88° (half up), 0.4° reads 0°', () => {
    expect(formatAngle(87.5)).toBe('88°');
    expect(formatAngle(0.4)).toBe('0°');
  });

  it('the sector holding the arc point decides the angle: 60° one side, 120° the other', () => {
    const a = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
    const b = { start: { x: 0, y: 0 }, end: { x: 50, y: 50 * Math.sqrt(3) } };
    expect(formatAngle(angularMeasure(a, b, { x: 40, y: 10 })!.degrees)).toBe('60°');
    expect(formatAngle(angularMeasure(a, b, { x: -40, y: 10 })!.degrees)).toBe('120°');
  });

  it('parallel walls measure nothing', () => {
    const a = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
    const b = { start: { x: 0, y: 50 }, end: { x: 100, y: 50 } };
    expect(angularMeasure(a, b, { x: 10, y: 10 })).toBeNull();
  });
});

describe('EZD-216 09m Dimensions row 8 and the auto overall dimension (AC-4)', () => {
  it('row 8: a room 141 1/2" × 168" inside reads 11\' 9 1/2" and 14\' 0"', () => {
    const r = room(ROOM, 141.5, 168);
    const box = roomInsideBox(r)!;
    const auto = (axis: 'x' | 'y'): DimensionData => ({
      geometry: { kind: 'auto', axis },
      status: 'existing',
      level: LEVEL_1,
      attributes: { kind: 'linear', offset: 18, override: null, auto: 'room', room: ROOM },
    });
    const look = { ...NO_LOOKUP, roomBox: () => box };
    expect(measuredText(measureDimension(auto('x'), look)!)).toBe(`11' 9 1/2"`);
    expect(measuredText(measureDimension(auto('y'), look)!)).toBe(`14' 0"`);
  });

  it('overall: the outer extents of every wall, thickness included', () => {
    // Inside faces 141 1/2" × 168", 4 1/2" walls outside: 150 1/2" × 177".
    const walls = withThickness(roomWalls(141.5, 168), 4.5);
    const box = wallsOuterBox(walls)!;
    expect(box).toEqual({ minX: -4.5, minY: -4.5, maxX: 146, maxY: 172.5 });
    expect(formatDimensionLength(box.maxX - box.minX)).toBe(`12' 6 1/2"`);
    expect(formatDimensionLength(box.maxY - box.minY)).toBe(`14' 9"`);
  });

  it('auto values come through the derived cache and recompute only when what they read changes', () => {
    const walls = roomWalls(141.5, 168);
    const r = room(ROOM, 141.5, 168);
    const sourceOf = (objs: ModelObject[]): DerivedSource => ({
      object: (id) => objs.find((o) => o.id.toLowerCase() === id.toLowerCase()) ?? null,
      objectsOf: ((type: string, level: string) =>
        objs.filter(
          (o) =>
            o.type === type &&
            'level' in o.data &&
            (o.data as { level: string }).level.toLowerCase() === level.toLowerCase(),
        )) as DerivedSource['objectsOf'],
    });
    const cache = createDerivedCache();
    let source = sourceOf([...walls, r]);
    cache.get(ROOM_INSIDE_BOX, ROOM, source);
    cache.get(FLOOR_WALL_BOX, LEVEL_1, source);
    // A wall edit: the walls list changed, the room did not.
    const moved = walls.map((w, i) =>
      i === 1 ? { ...w, data: { ...w.data, geometry: { start: { x: 160, y: 0 }, end: { x: 160, y: 168 } } } } : w,
    );
    source = sourceOf([...moved, r]);
    expect(cache.get(ROOM_INSIDE_BOX, ROOM, source)).toEqual({ minX: 0, minY: 0, maxX: 141.5, maxY: 168 });
    cache.get(FLOOR_WALL_BOX, LEVEL_1, source);
    expect(cache.stats().computes).toEqual({ 'room-inside-box': 1, 'floor-wall-box': 2 });
  });
});

describe('EZD-216 autoDimensionChanges (AC-4, AC-8; Q-0667; Q-0686)', () => {
  const autoOf = (c: { create: DimensionObject[] }) =>
    c.create.map((d) => ({
      auto: d.data.attributes.auto,
      room: d.data.attributes.room,
      axis: d.data.geometry.kind === 'auto' ? d.data.geometry.axis : null,
      status: d.data.status,
      offset: d.data.attributes.offset,
    }));

  it('a new room gets its width and depth; the floor with walls gets its overall pair, Existing', () => {
    const c = autoDimensionChanges([...roomWalls(141.5, 168), room(ROOM, 141.5, 168, 'new')], LEVEL_1, newId);
    expect(autoOf(c)).toEqual([
      { auto: 'room', room: ROOM, axis: 'x', status: 'new', offset: AUTO_ROOM_OFFSET_IN },
      { auto: 'room', room: ROOM, axis: 'y', status: 'new', offset: AUTO_ROOM_OFFSET_IN },
      { auto: 'overall', room: null, axis: 'x', status: 'existing', offset: AUTO_OVERALL_OFFSET_IN },
      { auto: 'overall', room: null, axis: 'y', status: 'existing', offset: AUTO_OVERALL_OFFSET_IN },
    ]);
    expect(c.update).toEqual([]);
    expect(c.remove).toEqual([]);
  });

  it('once placed, nothing changes; a moved offset is kept', () => {
    const base = [...roomWalls(141.5, 168), room(ROOM, 141.5, 168)];
    const first = autoDimensionChanges(base, LEVEL_1, newId);
    const placed = first.create.map((d, i) =>
      i === 0 ? { ...d, data: { ...d.data, attributes: { ...d.data.attributes, offset: 40 } } } : d,
    );
    const again = autoDimensionChanges([...base, ...placed], LEVEL_1, newId);
    expect(again).toEqual({ create: [], update: [], remove: [] });
  });

  it("a room's status change carries to its two auto dimensions; the overall stays Existing", () => {
    const base = [...roomWalls(141.5, 168), room(ROOM, 141.5, 168)];
    const placed = autoDimensionChanges(base, LEVEL_1, newId).create;
    const next = [...roomWalls(141.5, 168), room(ROOM, 141.5, 168, 'demo'), ...placed];
    const c = autoDimensionChanges(next, LEVEL_1, newId);
    expect(c.update.map((d) => [d.data.attributes.auto, d.data.status])).toEqual([
      ['room', 'demo'],
      ['room', 'demo'],
    ]);
  });

  it('a second room adds two; a deleted room removes its two; no walls removes the overall pair', () => {
    const walls = roomWalls(141.5, 168);
    const placed = autoDimensionChanges([...walls, room(ROOM, 141.5, 168)], LEVEL_1, newId).create;
    const two = autoDimensionChanges(
      [...walls, room(ROOM, 141.5, 168), room(ROOM2, 60, 60), ...placed],
      LEVEL_1,
      newId,
    );
    expect(two.create.map((d) => d.data.attributes.room)).toEqual([ROOM2, ROOM2]);
    const roomGone = autoDimensionChanges([...walls, ...placed], LEVEL_1, newId);
    expect(roomGone.remove).toEqual(placed.slice(0, 2).map((d) => d.id));
    const allGone = autoDimensionChanges(placed, LEVEL_1, newId);
    expect(allGone.remove).toEqual(placed.map((d) => d.id));
  });

  it('another floor is left alone', () => {
    const c = autoDimensionChanges([room(ROOM, 60, 60, 'existing', LEVEL_2)], LEVEL_1, newId);
    expect(c).toEqual({ create: [], update: [], remove: [] });
  });

  it('Q-0686 case 2 (a): a wall-face dimension whose wall is gone is removed', () => {
    const face: DimensionObject = {
      id: DIM,
      type: 'dimension',
      data: {
        ...pointsDim({ x: 0, y: 0 }, { x: 1, y: 0 }),
        geometry: { kind: 'wall_face', wallId: ID.W1, face: 'left' },
      },
    };
    const walls = roomWalls(100, 100);
    expect(autoDimensionChanges([...walls, face], LEVEL_1, newId).remove).toEqual([]);
    expect(autoDimensionChanges([...walls.slice(1), face], LEVEL_1, newId).remove).toEqual([DIM]);
  });
});

describe('EZD-216 09m Text paper size on screen rows 1 to 5 (AC-5)', () => {
  it('screen height = paper × 96 px × zoom', () => {
    expect(PX_PER_PAPER_IN).toBe(96);
    expect(paperScreenPx(PAPER_SIZE_IN['3/32'], 1)).toBe(9);
    expect(paperScreenPx(PAPER_SIZE_IN['3/32'], 2)).toBe(18);
    expect(paperScreenPx(PAPER_SIZE_IN['3/32'], 0.5)).toBe(4.5);
    expect(paperScreenPx(PAPER_SIZE_IN['1/8'], 1)).toBe(12);
    expect(paperScreenPx(PAPER_SIZE_IN['1/4'], 16)).toBe(384);
  });

  it('the model size at each plan scale gives the same screen size (px per model inch = 96 × scale ÷ 12)', () => {
    for (const scale of [0.125, 0.25, 0.5, 1]) {
      const pxPerModelIn = (96 * scale) / 12;
      expect(paperModelIn(PAPER_SIZE_IN['3/32'], scale) * pxPerModelIn * 1).toBeCloseTo(9, 9);
      expect(paperModelIn(PAPER_SIZE_IN['1/8'], scale) * pxPerModelIn * 1).toBeCloseTo(12, 9);
      expect(paperModelIn(PAPER_SIZE_IN['1/4'], scale) * pxPerModelIn * 16).toBeCloseTo(384, 9);
    }
    // At 1/2" = 1'-0" a 3/32" note is 2 1/4" of model.
    expect(paperModelIn(3 / 32, 0.5)).toBe(2.25);
  });
});

describe('EZD-216 drawing items of stored dimensions and notes', () => {
  const PLAN = { paperPtPerIn: 48, modelInPerPt: 0.5 };
  const floor = { id: LEVEL_1, type: 'floor' as const, data: { name: 'Floor 1', order: 1 } };
  const view = { level: LEVEL_1, dimensionTextPt: 10.5, roomHatch: null, roomLabelPt: 11.25 };
  const build = (objects: ModelObject[]) =>
    buildDrawingList({ objects: [floor as ModelObject, ...objects] }, view, [], { annotation: PLAN });
  const texts = (items: DrawingItem[]) =>
    items.flatMap((i) => (i.kind === 'text' ? [{ text: i.text, sizePt: i.sizePt, layer: i.layer }] : []));
  const dim = (data: DimensionData): ModelObject => ({ id: DIM, type: 'dimension', data });

  it('a two-point dimension: its text at 1/8" on paper, ticks and a broken line on the dimensions layer', () => {
    const list = build([dim({ ...pointsDim({ x: 0, y: 0 }, { x: 150, y: 0 }), attributes: { kind: 'linear', offset: 12, override: null, auto: null, room: null } })]);
    const mine = list.items.filter((i) => i.objectId === DIM);
    // 1/8" × 48 pt per paper inch.
    expect(texts(mine)).toEqual([{ text: `12' 6"`, sizePt: 6, layer: 'dimensions' }]);
    const lines = mine.filter((i) => i.kind === 'line');
    // Two extension lines, the line in two parts around its text, two ticks.
    expect(lines).toHaveLength(6);
    expect(lines.every((i) => i.layer === 'dimensions' && i.kind === 'line' && i.role === 'dimension')).toBe(true);
    expect(list.omitted).toEqual([]);
  });

  it('a zero-length dimension draws nothing and is omitted', () => {
    const list = build([dim(pointsDim({ x: 5, y: 5 }, { x: 5, y: 5 }))]);
    expect(list.items.filter((i) => i.objectId === DIM)).toEqual([]);
    expect(list.omitted).toEqual([{ id: DIM, reason: 'zero_length' }]);
  });

  it('override text replaces the value and is underlined (09h)', () => {
    const plain = build([dim(pointsDim({ x: 0, y: 0 }, { x: 150, y: 0 }))]);
    const over = build([
      dim({ ...pointsDim({ x: 0, y: 0 }, { x: 150, y: 0 }), attributes: { kind: 'linear', offset: 0, override: 'EQ', auto: null, room: null } }),
    ]);
    expect(texts(over.items)).toEqual([{ text: 'EQ', sizePt: 6, layer: 'dimensions' }]);
    const count = (l: typeof plain) => l.items.filter((i) => i.kind === 'line').length;
    expect(count(over)).toBe(count(plain) + 1);
    const m = linearMeasure({ x: 0, y: 0 }, { x: 150, y: 0 })!;
    expect(dimensionText(pointsDim({ x: 0, y: 0 }, { x: 150, y: 0 }), m)).toBe(`12' 6"`);
  });

  it('an angular dimension draws an arc and its whole degrees', () => {
    const walls = [
      wallObj(ID.W1, { x: 0, y: 0 }, { x: 120, y: 0 }),
      wallObj(ID.W2, { x: 0, y: 0 }, { x: 0, y: 120 }),
    ];
    const list = build([
      ...walls,
      dim({
        geometry: { kind: 'walls', wallIds: [ID.W1, ID.W2], at: { x: 30, y: 30 } },
        status: 'new',
        level: LEVEL_1,
        attributes: { kind: 'angular', offset: 0, override: null, auto: null, room: null },
      }),
    ]);
    const mine = list.items.filter((i) => i.objectId === DIM);
    expect(mine.filter((i) => i.kind === 'arc')).toHaveLength(1);
    expect(texts(mine)).toEqual([{ text: '90°', sizePt: 6, layer: 'dimensions' }]);
  });

  it('an auto room dimension draws from its room', () => {
    const list = build([
      room(ROOM, 141.5, 168),
      dim({
        geometry: { kind: 'auto', axis: 'x' },
        status: 'existing',
        level: LEVEL_1,
        attributes: { kind: 'linear', offset: 18, override: null, auto: 'room', room: ROOM },
      }),
    ]);
    expect(texts(list.items.filter((i) => i.objectId === DIM))).toEqual([
      { text: `11' 9 1/2"`, sizePt: 6, layer: 'dimensions' },
    ]);
  });

  it('a note of two lines at 3/32" on its status layer, with a leader and its arrowhead', () => {
    const data: TextData = {
      geometry: { position: { x: 100, y: 100 }, leader: { x: 40, y: 40 } },
      status: 'new',
      level: LEVEL_1,
      attributes: { text: 'VERIFY\nIN FIELD', paperSize: '3/32' },
    };
    const list = build([{ id: TXT, type: 'text', data }]);
    const mine = list.items.filter((i) => i.objectId === TXT);
    // 3/32" × 48 pt per paper inch = 4.5 pt.
    expect(texts(mine)).toEqual([
      { text: 'VERIFY', sizePt: 4.5, layer: 'new' },
      { text: 'IN FIELD', sizePt: 4.5, layer: 'new' },
    ]);
    const [first, second] = mine.filter((i) => i.kind === 'text');
    expect(first!.kind === 'text' && first!.at).toEqual({ x: 100, y: 100 });
    expect(second!.kind === 'text' && second!.at.y).toBeLessThan(100);
    const lines = mine.filter((i) => i.kind === 'line');
    expect(lines).toHaveLength(3);
    expect(lines.some((i) => i.kind === 'line' && i.to.x === 40 && i.to.y === 40)).toBe(true);
    const noLeader = build([{ id: TXT, type: 'text', data: { ...data, geometry: { ...data.geometry, leader: null } } }]);
    expect(noLeader.items.filter((i) => i.kind === 'line')).toHaveLength(0);
  });
});

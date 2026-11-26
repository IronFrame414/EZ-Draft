// EZD-509 auto-layout cans. Expected values come from the ticket and the worked examples in
// vault/build/assumptions/EZD-509.md, worked by hand:
// - AC-EZD-509-1: 30 fc x 320 sf / (800 lm x 0.6 x 0.8) = 9,600 / 384 = 25 exactly, so 25 (not 26).
// - 321 sf: 9,630 / 384 = 25.08, rounded up to 26.
// - AC-EZD-509-2 / "Even grid": 8 cans in 20' x 16' (240" x 192"): cols = ceil(sqrt(8 x 240 / 192)) = ceil(3.16) = 4,
//   rows = 2; x = 30, 90, 150, 210 (2' 6", 7' 6", 12' 6", 17' 6"), y = 48, 144 (4' 0", 12' 0").
// - 7 cans in the same room: cols = ceil(sqrt(8.75)) = 3, rows = 3, columns at 40, 120, 200, rows at 32, 96, 160;
//   the last row's one can is centred at 120.
// - By spacing 48": floor(240 / 48) = 5 across from 24 (24, 72, 120, 168, 216), floor(192 / 48) = 4 from 24.
import { CURRENT_SCHEMA_VERSION, newRoomAttributes, parseStoredObject, type Point } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { F1, uid } from '../tools/test-utils/fixtures';
import {
  canTypes,
  gridByCount,
  gridBySpacing,
  layoutRoom,
  lightLevelCount,
  placeCans,
  snapPoints,
} from './auto-layout';

const P = (x: number, y: number): Point => ({ x, y });
const RECT = [P(0, 0), P(240, 0), P(240, 192), P(0, 192)];
const key = (p: Point) => `${Math.round(p.x * 1000) / 1000},${Math.round(p.y * 1000) / 1000}`;
const keys = (ps: readonly Point[]) => ps.map(key).sort();
const grid = (xs: number[], ys: number[]) => xs.flatMap((x) => ys.map((y) => key(P(x, y)))).sort();

function room(boundary: Point[], roomType: string | null = null): ObjectValue {
  return {
    type: 'room',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: {
      geometry: { boundary },
      status: 'existing',
      level: F1,
      attributes: { ...newRoomAttributes('Family room'), roomType },
      closureOverride: null,
    },
  };
}

function light(attributes: Record<string, unknown>): ObjectValue {
  return {
    type: 'device',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: {
      geometry: { point: P(10, 10) },
      status: 'new',
      level: F1,
      attributes: { kind: 'recessed_light', ...attributes },
    },
  };
}

describe('EZD-509 light-level count (lumen method)', () => {
  it('AC-EZD-509-1: a 320 sf room at 30 fc with 800 lm cans, CU 0.6 and LLF 0.8 returns 25', () => {
    expect(lightLevelCount({ targetFc: 30, areaSqFt: 320, lumens: 800, cu: 0.6, llf: 0.8 })).toBe(25);
  });

  it("AC-EZD-509-1 from the room: 20' x 16' is 320 sf and gives 25", () => {
    const r = layoutRoom(new Map([[uid(1), room(RECT)]]), uid(1));
    expect(r?.areaSqFt).toBe(320);
    expect(lightLevelCount({ targetFc: 30, areaSqFt: r!.areaSqFt, lumens: 800, cu: 0.6, llf: 0.8 })).toBe(25);
  });

  it('rounds up: 321 sf gives 26', () => {
    expect(lightLevelCount({ targetFc: 30, areaSqFt: 321, lumens: 800, cu: 0.6, llf: 0.8 })).toBe(26);
  });

  it('is null when an input is missing or not above 0', () => {
    expect(lightLevelCount({ targetFc: 0, areaSqFt: 320, lumens: 800, cu: 0.6, llf: 0.8 })).toBeNull();
    expect(lightLevelCount({ targetFc: 30, areaSqFt: 320, lumens: Number.NaN, cu: 0.6, llf: 0.8 })).toBeNull();
    expect(lightLevelCount({ targetFc: 30, areaSqFt: 0, lumens: 800, cu: 0.6, llf: 0.8 })).toBeNull();
  });
});

describe('EZD-509 even grid by count', () => {
  it("AC-EZD-509-2: by count 8 returns an even grid of 8 (4 x 2 in 20' x 16')", () => {
    const pts = gridByCount(RECT, 8);
    expect(pts).toHaveLength(8);
    expect(keys(pts)).toEqual(grid([30, 90, 150, 210], [48, 144]));
  });

  it('the same grid when the long wall runs north-south', () => {
    const tall = [P(0, 0), P(192, 0), P(192, 240), P(0, 240)];
    expect(keys(gridByCount(tall, 8))).toEqual(grid([48, 144], [30, 90, 150, 210]));
  });

  it('a short last row keeps the column spacing and is centred', () => {
    const pts = gridByCount(RECT, 7);
    expect(keys(pts)).toEqual(
      [...grid([40, 120, 200], [32, 96]), key(P(120, 160))].sort(),
    );
  });

  it('nothing for no count', () => {
    expect(gridByCount(RECT, 0)).toEqual([]);
    expect(gridByCount(RECT, 2.5)).toEqual([]);
  });

  it('drops points outside a room that is not a rectangle', () => {
    // An L: the 240 x 192 box with its 120 x 96 north-east corner cut away. 8 in the box at (210, 144) and (150, 144)
    // fall in the cut corner, so 6 remain.
    const L = [P(0, 0), P(240, 0), P(240, 96), P(120, 96), P(120, 192), P(0, 192)];
    const pts = gridByCount(L, 8);
    expect(keys(pts)).toEqual(
      [...grid([30, 90, 150, 210], [48]), ...grid([30, 90], [144])].sort(),
    );
  });
});

describe('EZD-509 grid by spacing', () => {
  it('floor(side / spacing) per side, centred', () => {
    expect(keys(gridBySpacing(RECT, 48))).toEqual(grid([24, 72, 120, 168, 216], [24, 72, 120, 168]));
  });

  it('a spacing wider than the room still places one can at the centre', () => {
    expect(keys(gridBySpacing(RECT, 300))).toEqual([key(P(120, 96))]);
  });
});

describe('EZD-509 can types and Place', () => {
  it("a tag's lumens are the first a can with that tag has; tags in order", () => {
    const objects = new Map<string, ObjectValue>([
      [uid(10), light({ typeTag: 'B', lumens: 650 })],
      [uid(11), light({ typeTag: 'A', colorTemp: 3000 })],
      [uid(12), light({ typeTag: 'A', lumens: 800 })],
      [uid(13), light({})],
    ]);
    const types = canTypes(objects);
    expect(types.map((x) => [x.typeTag, x.lumens])).toEqual([
      ['A', 800],
      ['B', 650],
    ]);
    expect(types[0]!.attributes).toEqual({ typeTag: 'A', colorTemp: 3000, lumens: 800 });
  });

  it('Place makes one valid recessed light per point with the type copied', () => {
    let n = 100;
    const changes = placeCans([P(30, 48), P(90, 48)], {
      level: F1,
      status: 'new',
      newId: () => uid(n++),
      type: { typeTag: 'A', lumens: 800, attributes: { typeTag: 'A', lumens: 800 } },
    });
    expect(changes).toHaveLength(2);
    for (const c of changes!) {
      const v = c.value!;
      const parsed = parseStoredObject({ id: c.id, type: v.type, schema_version: v.schemaVersion, data: v.data });
      expect(parsed.ok).toBe(true);
      expect(v.data).toMatchObject({
        status: 'new',
        level: F1,
        attributes: { kind: 'recessed_light', typeTag: 'A', lumens: 800 },
      });
    }
    expect(changes!.map((c) => (c.value!.data as { geometry: { point: Point } }).geometry.point)).toEqual([
      P(30, 48),
      P(90, 48),
    ]);
  });

  it('the room type comes with the room (a room with none reads null, so Other is used)', () => {
    expect(layoutRoom(new Map([[uid(1), room(RECT, 'kitchen')]]), uid(1))?.roomType).toBe('kitchen');
    expect(layoutRoom(new Map([[uid(1), room(RECT)]]), uid(1))?.roomType).toBeNull();
  });
});

describe('EZD-509 ACT snap', () => {
  it('two grid points that snap into one tile give one can', () => {
    // A stub tile snap: 24" tiles, each point to its tile centre. 12 and 20 share the tile 0-24 (centre 12).
    const snap = (p: Point) => P(Math.floor(p.x / 24) * 24 + 12, Math.floor(p.y / 24) * 24 + 12);
    expect(snapPoints([P(12, 12), P(20, 12), P(40, 12)], snap)).toEqual([P(12, 12), P(36, 12)]);
  });
});

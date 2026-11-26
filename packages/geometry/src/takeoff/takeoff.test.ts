// EZD-1611a (AC-EZD-1611a-1; 09i Takeoff rules; S15d Decision 6; vault/build/assumptions/EZD-1611a.md; AC-EZD-1612-1's
// worked example): the fixture kitchen and bath return the expected-quantity JSON for every room-finish line. Every
// expected number is worked by hand (fixtures/kitchen-bath.md and the comments here) from the formulas table, never
// from running this code.
import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  parseModelDocument,
  parseStoredObject,
  type ModelObject,
  type StoredObject,
} from '../schema';
import expected from './fixtures/kitchen-bath.expected.json';
import model from './fixtures/kitchen-bath.model.json';
import {
  roomFinishTakeoff,
  roundUpTenth,
  roundUpWhole,
  tileShowerFacesSqIn,
  type TakeoffLine,
  type TakeoffSettings,
} from './index';

type Of<T extends ModelObject['type']> = Extract<ModelObject, { type: T }>;

const stored = model.objects as StoredObject[];
const parsed = (): ModelObject[] =>
  stored.map((o) => {
    const r = parseStoredObject(o);
    if (!r.ok) throw new Error(`${o.id} ${r.issue.issue}`);
    return r.object;
  });
const settings = expected.settings as TakeoffSettings;
const uid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const find = <T extends ModelObject['type']>(id: number) =>
  parsed().find((o) => o.id === uid(id)) as Of<T>;
const pick = (lines: TakeoffLine[], room: number | null, item: string) =>
  lines.filter((l) => l.roomId === (room === null ? null : uid(room)) && l.item === item);
const withStatus = (o: ModelObject, status: 'existing' | 'demo' | 'new'): ModelObject =>
  'status' in o.data ? ({ ...o, data: { ...o.data, status } } as ModelObject) : o;
const KITCHEN = 0x31;
const BATH = 0x32;

describe('EZD-1611a room-finish takeoff', () => {
  it('the fixture is a valid stored model at the current schema version', () => {
    for (const o of stored) expect(o.schema_version, o.id).toBe(CURRENT_SCHEMA_VERSION);
    expect(parseModelDocument({ objects: stored }).ok).toBe(true);
  });

  it('AC-EZD-1611a-1: returns the expected-quantity JSON for every room-finish line of the fixture', () => {
    expect(roomFinishTakeoff(parsed(), settings)).toEqual(expected.lines);
  });

  it('pattern waste adds to tile waste: 100 SF straight 110.0 SF, herringbone 115.0 SF (AC-EZD-1612-1 example)', () => {
    const room = find<'room'>(KITCHEN);
    const square: ModelObject = {
      ...room,
      data: {
        ...room.data,
        geometry: {
          boundary: [
            { x: 1000, y: 1000 },
            { x: 1120, y: 1000 },
            { x: 1120, y: 1120 },
            { x: 1000, y: 1120 },
          ],
        },
      },
    };
    const layout = find<'tile_layout'>(0x61);
    const floor = (pattern: 'straight' | 'herringbone') => {
      const t = {
        ...layout,
        data: { ...layout.data, attributes: { ...layout.data.attributes, pattern } },
      };
      return pick(roomFinishTakeoff([square, t], settings), KITCHEN, 'floor_tile')[0];
    };
    expect(floor('straight')).toMatchObject({
      qty: 100,
      waste: { pct: 10 },
      total: 110,
      count: { value: 11 },
    });
    expect(floor('herringbone')).toMatchObject({
      qty: 100,
      waste: { pct: 15 },
      total: 115,
      count: { value: 12 },
    });
  });

  it('an unset waste factor keeps the quantity, with no total and no order count, never 0% (S15d Decision 6)', () => {
    const unset: TakeoffSettings = {
      ...settings,
      waste: { tile: null, drywall: null, paint: null, trim: null },
      pattern: { straight: 0, diagonal: null, herringbone: null },
    };
    const lines = roomFinishTakeoff(parsed(), unset);
    expect(pick(lines, KITCHEN, 'floor_tile')[0]).toMatchObject({
      qty: 108,
      waste: { material: 'tile', pct: null },
      total: null,
      count: { unit: 'boxes', value: null },
    });
    expect(pick(lines, KITCHEN, 'drywall')[0]).toMatchObject({
      qty: 160,
      total: null,
      count: { value: null },
    });
    expect(pick(lines, KITCHEN, 'paint_walls')[0]).toMatchObject({
      qty: 331,
      total: null,
      count: { value: null },
    });
    expect(pick(lines, KITCHEN, 'base_trim')[0]).toMatchObject({ qty: 41, total: null });
    // Casing uses no waste.
    expect(pick(lines, BATH, 'casing')[0]).toMatchObject({ qty: 32.7, waste: null, total: 32.7 });
    // Tile waste set but the herringbone adjustment not: the bath floor has no total.
    const half = roomFinishTakeoff(parsed(), {
      ...settings,
      pattern: { ...settings.pattern, herringbone: null },
    });
    expect(pick(half, BATH, 'floor_tile')[0]).toMatchObject({
      qty: 35.7,
      total: null,
      waste: { pct: null },
    });
    for (const l of lines)
      for (const v of [l.qty, l.total, l.count?.value]) expect(Number.isNaN(v), l.item).toBe(false);
  });

  it('a tub comes off the floor tile like a base cabinet box', () => {
    const tub: ModelObject = {
      id: uid(0x81),
      type: 'fixture',
      data: {
        geometry: { center: { x: 178.5, y: 30 }, axis: { x: 1, y: 0 } },
        status: 'new',
        level: uid(1),
        attributes: { kind: 'tub', width: 60, depth: 30 },
      },
    };
    // 5,130 - 60 x 30 (1,800) = 3,330 sq in = 23.125 -> 23.2 SF; x 1.15 = 26.59 -> 26.6 SF; 2.66 -> 3 boxes.
    const bath = pick(roomFinishTakeoff([...parsed(), tub], settings), BATH, 'floor_tile')[0]!;
    expect(bath).toMatchObject({ qty: 23.2, total: 26.6, count: { unit: 'boxes', value: 3 } });
    expect(bath.sourceIds).toContain(uid(0x81));
  });

  it('only New work is counted: an all-existing model has no lines, and demolished objects are never counted', () => {
    const existing = parsed().map((o) => withStatus(o, 'existing'));
    expect(roomFinishTakeoff(existing, settings)).toEqual([]);
    // A New window in the kitchen: casing 2 x 48 + 36 = 132" = 11 LF, one side; the demolished door is not
    // deducted from paint or base: 528 x 96 = 352 SF; base 44 LF.
    const lines = roomFinishTakeoff(
      existing.map((o) =>
        o.id === uid(0x21) ? withStatus(o, 'new') : o.id === uid(0x22) ? withStatus(o, 'demo') : o,
      ),
      settings,
    );
    expect(pick(lines, KITCHEN, 'casing')[0]).toMatchObject({ qty: 11, sourceIds: [uid(0x21)] });
    expect(pick(lines, KITCHEN, 'paint_walls')[0]).toMatchObject({ qty: 352 });
    expect(pick(lines, KITCHEN, 'base_trim')[0]).toMatchObject({ qty: 44 });
    expect(pick(lines, KITCHEN, 'floor_tile')).toEqual([]);
    expect(pick(lines, BATH, 'paint_walls')).toEqual([]);
  });

  it('a door with a room on one face only is cased on one side', () => {
    // Without the hall, the bath door: 2 x 80 + 36 = 196" = 16.33 -> 16.4 LF.
    const lines = roomFinishTakeoff(
      parsed().filter((o) => o.id !== uid(0x33)),
      settings,
    );
    expect(pick(lines, BATH, 'casing')[0]).toMatchObject({ qty: 16.4, total: 16.4 });
  });

  it('paints walls to the room ceiling height at that wall when it is lower than the wall', () => {
    const k = find<'room'>(KITCHEN);
    const ceiling = {
      heightsBy: 'wall' as const,
      wallHeights: [{ wall: uid(0x11), height: 90 }],
      pointHeights: [],
      pitch: null,
      ridge: null,
    };
    const lowered = { ...k, data: { ...k.data, attributes: { ...k.data.attributes, ceiling } } };
    // The south wall, 144" long, 6" lower: 331 - 144 x 6 / 144 = 325 SF.
    const lines = roomFinishTakeoff(
      parsed().map((o) => (o.id === k.id ? lowered : o)),
      settings,
    );
    expect(pick(lines, KITCHEN, 'paint_walls')[0]).toMatchObject({ qty: 325 });
  });

  it('a wall tile face loses the part of an opening below its set height', () => {
    // Wainscot to 48" on the kitchen's north wall: 144 x 48 = 6,912 less the window from 36" to 48" (36 x 12 = 432)
    // = 6,480 sq in = 45 SF; x 1.10 = 49.5 SF; 4.95 -> 5 boxes.
    const layout = find<'tile_layout'>(0x63);
    const host = { kind: 'wall' as const, wallId: uid(0x13), side: 'left' as const, height: 48 };
    const north = {
      ...layout,
      id: uid(0x64),
      data: { ...layout.data, geometry: { ...layout.data.geometry, host } },
    };
    const k = pick(roomFinishTakeoff([...parsed(), north], settings), KITCHEN, 'wall_tile')[0]!;
    expect(k).toMatchObject({ qty: 45, total: 49.5, count: { unit: 'boxes', value: 5 } });
    expect(k.sourceIds).toEqual([uid(0x64), uid(0x13), uid(0x21)]);
  });

  it('a shower bench adds its top, front and open end and covers the walls behind it', () => {
    const shower = find<'tile_shower'>(0x71);
    const bench = { width: 24, depth: 15, height: 18 };
    const withBench = {
      ...shower,
      data: { ...shower.data, attributes: { ...shower.data.attributes, bench } },
    };
    // + 24 x 15 + 24 x 18 + 15 x 18 = 360 + 432 + 270 = 1,062; - 18 x (24 + 15) = 702; net + 360 sq in.
    expect(tileShowerFacesSqIn(withBench) - tileShowerFacesSqIn(shower)).toBe(360);
    expect(tileShowerFacesSqIn(shower)).toBe(13644);
  });

  it('object types and kinds the takeoff does not read give no line and no error', () => {
    const stair = {
      id: uid(0x91),
      type: 'stair',
      data: { status: 'new', level: uid(1) },
    } as unknown as ModelObject;
    const window = find<'opening'>(0x21);
    const garage = {
      ...window,
      id: uid(0x92),
      data: {
        ...window.data,
        status: 'new',
        geometry: { ...window.data.geometry, center: { x: 72, y: -2.25 }, hostWallId: uid(0x11) },
        attributes: { ...window.data.attributes, kind: 'garage_door', width: 96, height: 84 },
      },
    } as unknown as ModelObject;
    expect(roomFinishTakeoff([...parsed(), stair, garage], settings)).toEqual(expected.lines);
  });

  it('rounds SF and LF up to 0.1 and order units up to whole, without float noise pushing an exact value up', () => {
    expect(roundUpTenth((108 * 110) / 100)).toBe(118.8);
    expect(roundUpTenth(108 * 1.1)).toBe(118.8);
    expect(roundUpTenth(392 / 12)).toBe(32.7);
    expect(roundUpTenth(35.625)).toBe(35.7);
    expect(roundUpWhole(100 * 1.1)).toBe(110);
    expect(roundUpWhole(5.5)).toBe(6);
    expect(roundUpWhole(0)).toBe(0);
  });
});

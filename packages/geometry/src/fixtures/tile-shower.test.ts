// EZD-226 (AC-EZD-226-1, -2, -3; Q-0704 03-data-model and 09-calculations; 09q Tile shower rows 1, 4, 6, 7, 9;
// vault/build/assumptions.md EZD-226). Expected values worked by hand. The 5x8 bath shower is the box x 0 to 60,
// y 0 to 36 (frame = world). Side 0 runs (0,0) to (60,0), side 2 runs (60,36) to (0,36), the long back wall.
// - Curb 4" wide inside side 0: the line (0,4) to (60,4).
// - One 12" niche centred on side 2: (60 - 12) / 2 = 24" from (60,36), so (36,36) to (24,36), a box 3.5" behind
//   the wall to y 39.5.
// - Linear drain, side 2, offset 0, length 60: (60,36) to (0,36), a strip 2.5" in to y 33.5.
// - Glass on side 0: a 24" fixed panel (0,0) to (24,0), then a 30" door (24,0) to (54,0) swinging out, its leaf
//   (24,0) to (24,-30) and its arc centred (24,0), radius 30, from 270 to 360 degrees.
// - Bench 24" wide along the left wall (side 3), 15" deep, in the back corner at footprint[3]: x 0 to 15,
//   y 36 - 24 = 12 to 36, so (0,12), (15,12), (15,36), (0,36).
// - A rotated shower with footprint (10,0), (10,60), (-26,60), (-26,0) has x along +y and y along -x, so a center
//   drain at frame (30,18) is at world (10 - 18, 0 + 30) = (-8, 30).
// - Moved by (24, -12), the center drain at frame (30,18) moves from (30,18) to (54,6).
import { describe, expect, it } from 'vitest';
import { buildDrawingList } from '../drawing/build';
import { CURRENT_SCHEMA_VERSION, parseStoredObject, type ModelObject } from '../schema';
import { moveSelection } from '../moves/selection';
import { tileShowerPickShape } from '../selection/shapes';
import {
  moveTileShower,
  showerBenchAt,
  showerDrainAt,
  showerGlassAt,
  showerNichesAt,
  type TileShowerObject,
} from './tile-shower';

const F1 = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
const SHOWER = '00000000-0000-4000-8000-000000000226';
const p = (x: number, y: number) => ({ x, y });

function bath(): TileShowerObject {
  return {
    id: SHOWER,
    type: 'tile_shower',
    data: {
      geometry: { footprint: [p(0, 0), p(60, 0), p(60, 36), p(0, 36)] },
      status: 'new',
      level: F1,
      attributes: {
        curb: { height: 4, width: 4 },
        niches: [{ width: 12, height: 24, bottomHeight: 48, side: 2 }],
        bench: null,
        glass: [],
        panSlope: 0.25,
        drain: { type: 'linear', side: 2, offset: 0, length: 60 },
      },
    },
  };
}

const parses = (data: unknown) =>
  parseStoredObject({
    id: SHOWER,
    type: 'tile_shower',
    schema_version: CURRENT_SCHEMA_VERSION,
    data,
  }).ok;

function withAttrs(edit: (a: Record<string, unknown>) => void): unknown {
  const d = structuredClone(bath().data) as unknown as { attributes: Record<string, unknown> };
  edit(d.attributes);
  return d;
}

const drawList = (objects: ModelObject[]) =>
  buildDrawingList(
    { objects: [{ id: F1, type: 'floor', data: { name: 'Floor 1', order: 1 } }, ...objects] },
    { level: F1, dimensionTextPt: 10, roomHatch: null, roomLabelPt: 11 },
  );

describe('EZD-226 AC-1 the 5x8 bath shower', () => {
  it('stores a 60" x 36" tile_shower with a 4" curb, one 12" x 24" niche, a linear drain on the long side and 1/4" per ft', () => {
    const r = parseStoredObject({
      id: SHOWER,
      type: 'tile_shower',
      schema_version: CURRENT_SCHEMA_VERSION,
      data: bath().data,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.object).toEqual(bath());
  });

  it('draws its outline, curb, niche, and drain on the plan in its status layer', () => {
    const items = drawList([bath()]).items.filter((i) => i.objectId === SHOWER);
    const lines = items.map((i) => (i.kind === 'line' ? [i.layer, i.role, i.from, i.to] : i.kind));
    expect(lines).toEqual([
      ['new', 'beyond', p(0, 0), p(60, 0)],
      ['new', 'beyond', p(60, 0), p(60, 36)],
      ['new', 'beyond', p(60, 36), p(0, 36)],
      ['new', 'beyond', p(0, 36), p(0, 0)],
      ['new', 'beyond', p(0, 4), p(60, 4)],
      ['new', 'hidden', p(36, 36), p(24, 36)],
      ['new', 'hidden', p(24, 36), p(24, 39.5)],
      ['new', 'hidden', p(24, 39.5), p(36, 39.5)],
      ['new', 'hidden', p(36, 39.5), p(36, 36)],
      ['new', 'beyond', p(60, 36), p(0, 36)],
      ['new', 'beyond', p(0, 36), p(0, 33.5)],
      ['new', 'beyond', p(0, 33.5), p(60, 33.5)],
      ['new', 'beyond', p(60, 33.5), p(60, 36)],
    ]);
  });

  it('draws glass with a door leaf and swing, a bench, and a center drain mark', () => {
    const s = bath();
    s.data.attributes.glass = [
      { type: 'fixed', length: 24, side: 0 },
      { type: 'door', length: 30, side: 0, swing: 'out' },
    ];
    s.data.attributes.bench = { width: 24, depth: 15, height: 18 };
    s.data.attributes.drain = { type: 'center', at: p(30, 18) };
    expect(showerBenchAt(s.data)).toEqual([p(0, 12), p(15, 12), p(15, 36), p(0, 36)]);
    const items = drawList([s]).items.filter((i) => i.objectId === SHOWER);
    const pick = items.map((i) =>
      i.kind === 'line'
        ? [i.from, i.to]
        : i.kind === 'arc'
          ? [i.center, i.radius, i.startAngle, i.endAngle]
          : null,
    );
    expect(pick).toContainEqual([p(0, 0), p(24, 0)]);
    expect(pick).toContainEqual([p(24, 0), p(54, 0)]);
    expect(pick).toContainEqual([p(24, 0), p(24, -30)]);
    expect(pick).toContainEqual([p(24, 0), 30, 270, 360]);
    expect(pick).toContainEqual([p(0, 12), p(15, 12)]);
    expect(pick).toContainEqual([p(30, 18), 2, 0, 360]);
  });

  it('picks by its footprint', () => {
    expect(tileShowerPickShape(bath())).toEqual({
      kind: 'quad',
      points: [p(0, 0), p(60, 0), p(60, 36), p(0, 36)],
      area: 2160,
    });
  });
});

describe('EZD-226 AC-2 optional parts and sizes', () => {
  it('curb, niches, bench and glass are optional', () => {
    expect(
      parses(
        withAttrs((a) => {
          a.curb = null;
          a.niches = [];
          a.bench = null;
          a.glass = [];
        }),
      ),
    ).toBe(true);
    expect(
      parses(
        withAttrs(
          (a) =>
            (a.niches = [0, 2].map((side) => ({ width: 12, height: 24, bottomHeight: 48, side }))),
        ),
      ),
    ).toBe(true);
  });

  it('a 24" x 24" shower saves (09q row 4)', () => {
    const d = structuredClone(bath().data);
    d.geometry.footprint = [p(0, 0), p(24, 0), p(24, 24), p(0, 24)];
    d.attributes.drain = { type: 'center', at: p(12, 12) };
    expect(parses(d)).toBe(true);
  });

  it.each([
    ['curb height 0', (a: Record<string, unknown>) => (a.curb = { height: 0, width: 4 })],
    ['curb height -1', (a: Record<string, unknown>) => (a.curb = { height: -1, width: 4 })],
    ['curb width 0', (a: Record<string, unknown>) => (a.curb = { height: 4, width: 0 })],
    [
      'niche width 0',
      (a: Record<string, unknown>) =>
        (a.niches = [{ width: 0, height: 24, bottomHeight: 48, side: 2 }]),
    ],
    [
      'niche height -2',
      (a: Record<string, unknown>) =>
        (a.niches = [{ width: 12, height: -2, bottomHeight: 48, side: 2 }]),
    ],
    [
      'bench depth 0',
      (a: Record<string, unknown>) => (a.bench = { width: 36, depth: 0, height: 18 }),
    ],
    [
      'bench height -18',
      (a: Record<string, unknown>) => (a.bench = { width: 36, depth: 15, height: -18 }),
    ],
    [
      'glass length 0',
      (a: Record<string, unknown>) => (a.glass = [{ type: 'fixed', length: 0, side: 0 }]),
    ],
    [
      'door length -30',
      (a: Record<string, unknown>) =>
        (a.glass = [{ type: 'door', length: -30, side: 0, swing: 'in' }]),
    ],
    [
      'linear drain length 0',
      (a: Record<string, unknown>) => (a.drain = { type: 'linear', side: 2, offset: 0, length: 0 }),
    ],
    ['pan slope 0', (a: Record<string, unknown>) => (a.panSlope = 0)],
    ['pan slope -1/4', (a: Record<string, unknown>) => (a.panSlope = -0.25)],
  ])('%s is refused', (_name, edit) => {
    expect(parses(withAttrs(edit))).toBe(false);
  });

  it('a 0" wide or 0" deep footprint is refused (09q row 9)', () => {
    const d = structuredClone(bath().data);
    d.geometry.footprint = [p(0, 0), p(0, 0), p(0, 36), p(0, 36)];
    expect(parses(d)).toBe(false);
    d.geometry.footprint = [p(0, 0), p(60, 0), p(60, 0), p(0, 0)];
    expect(parses(d)).toBe(false);
  });
});

describe('EZD-226 AC-3 the drain, niches and glass are in the shower frame', () => {
  it('a center drain stores a point; a linear drain stores side, offset and length', () => {
    const center = withAttrs((a) => (a.drain = { type: 'center', at: p(30, 18) }));
    expect(parses(center)).toBe(true);
    expect(parses(withAttrs((a) => (a.drain = { type: 'center', at: p(30, 18), side: 0 })))).toBe(
      false,
    );
    expect(parses(withAttrs((a) => (a.drain = { type: 'linear', side: 2, offset: 0 })))).toBe(
      false,
    );
    expect(
      parses(withAttrs((a) => (a.drain = { type: 'linear', side: 4, offset: 0, length: 60 }))),
    ).toBe(false);
  });

  it('a frame point is read through the footprint, so a turned shower places its drain turned', () => {
    const s = bath();
    s.data.geometry.footprint = [p(10, 0), p(10, 60), p(-26, 60), p(-26, 0)];
    s.data.attributes.drain = { type: 'center', at: p(30, 18) };
    expect(showerDrainAt(s.data)).toEqual({ type: 'center', at: p(-8, 30) });
  });

  it('moving the shower moves its drain, niches and glass and leaves its attributes alone', () => {
    const s = bath();
    s.data.attributes.glass = [{ type: 'door', length: 30, side: 0, swing: 'in' }];
    const objects: ModelObject[] = [s];
    const r = moveSelection(objects, [SHOWER], p(24, -12));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changed).toHaveLength(1);
    const moved = r.changed[0] as TileShowerObject;
    expect(moved.data.geometry.footprint).toEqual([p(24, -12), p(84, -12), p(84, 24), p(24, 24)]);
    expect(moved.data.attributes).toEqual(s.data.attributes);
    expect(showerDrainAt(moved.data)).toEqual({
      type: 'linear',
      side: 2,
      from: p(84, 24),
      to: p(24, 24),
    });
    expect(showerNichesAt(moved.data)).toEqual([{ side: 2, from: p(60, 24), to: p(48, 24) }]);
    expect(showerGlassAt(moved.data).map((g) => [g.from, g.to])).toEqual([
      [p(24, -12), p(54, -12)],
    ]);

    const c = bath();
    c.data.attributes.drain = { type: 'center', at: p(30, 18) };
    expect(showerDrainAt(c.data)).toEqual({ type: 'center', at: p(30, 18) });
    expect(showerDrainAt(moveTileShower(c, p(24, -12)).data)).toEqual({
      type: 'center',
      at: p(54, 6),
    });
    expect(c.data.geometry.footprint[0]).toEqual(p(0, 0));
  });
});

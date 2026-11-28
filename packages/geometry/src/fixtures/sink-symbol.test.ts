// EZD-2045 (AC-EZD-2045-1, -2; Josh 2026-11-28 Q-0922 "change the sink to be a single basin"). Expected values by hand
// from the layout rules kept from EZD-422 (bowl inset 6% of the width at each side, 10% of the depth at the front, the
// back 20% of the depth the faucet deck; drain mark 3" across) with the one bowl Q-0922 asks for, drain on the centre
// line (EZD-729). A 33" × 22" sink (EZD-234 panel size) at (100, 50), axis +x (front facing down):
//   outline x 83.5 to 116.5, y 39 to 61 (back edge y = 61);
//   bowl x 83.5 + 1.98 = 85.48 to 116.5 - 1.98 = 114.52, y 39 + 2.2 = 41.2 to 61 - 4.4 = 56.6;
//   faucet deck y 56.6 to 61; one drain at (100, (41.2 + 56.6) / 2 = 48.9), radius 1.5.
// Its plumbing locations (EZD-729): hot (92, 61), drain (100, 61), cold (108, 61). Its cutout (EZD-413) is the sink's
// own 33" × 22" at its centre.
import { describe, expect, it } from 'vitest';
import { cutoutCorners, cutoutFromFixture } from '../countertops/cutout';
import { buildDrawingList } from '../drawing/build';
import type { DrawingItem } from '../drawing/types';
import { plumbingLocations } from '../plumbing/locations';
import { pointInRing } from '../rooms/area';
import type { ModelObject, ObjectStatus, Point } from '../schema';
import { fixtureSymbolItems } from './fixture-symbol';
import type { FixtureObject } from './fixtures';

const F1 = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
const SINK = '00000000-0000-4000-8000-000000000005';
const sink = (axis: Point = { x: 1, y: 0 }, status: ObjectStatus = 'new'): FixtureObject => ({
  id: SINK,
  type: 'fixture',
  data: {
    geometry: { center: { x: 100, y: 50 }, axis },
    status,
    level: F1,
    attributes: { kind: 'sink', width: 33, depth: 22 },
  },
});

const r = (n: number) => Math.round(n * 1000) / 1000 + 0;
const pt = (p: Point) => ({ x: r(p.x), y: r(p.y) });
const shape = (items: DrawingItem[]) =>
  items.map((i) =>
    i.kind === 'line'
      ? ['line', i.layer, i.role, pt(i.from), pt(i.to)]
      : i.kind === 'arc'
        ? ['arc', i.layer, i.role, pt(i.center), r(i.radius), i.startAngle, i.endAngle]
        : [i.kind],
  );
const p = (x: number, y: number) => ({ x, y });

const ONE_BOWL = (layer: ObjectStatus) => [
  // Outline: back left, back right, front right, front left.
  ['line', layer, 'beyond', p(83.5, 61), p(116.5, 61)],
  ['line', layer, 'beyond', p(116.5, 61), p(116.5, 39)],
  ['line', layer, 'beyond', p(116.5, 39), p(83.5, 39)],
  ['line', layer, 'beyond', p(83.5, 39), p(83.5, 61)],
  // The one bowl, its back side 4.4" in front of the back edge (the faucet deck).
  ['line', layer, 'beyond', p(85.48, 56.6), p(114.52, 56.6)],
  ['line', layer, 'beyond', p(114.52, 56.6), p(114.52, 41.2)],
  ['line', layer, 'beyond', p(114.52, 41.2), p(85.48, 41.2)],
  ['line', layer, 'beyond', p(85.48, 41.2), p(85.48, 56.6)],
  // One drain on the centre line.
  ['arc', layer, 'beyond', p(100, 48.9), 1.5, 0, 360],
];

describe('EZD-2045 the sink draws a single basin', () => {
  it('AC-EZD-2045-1 a sink draws its outline, one bowl in front of the faucet deck and one centred drain', () => {
    expect(shape(fixtureSymbolItems(sink(), 10))).toEqual(ONE_BOWL('new'));
  });

  it('AC-EZD-2045-1 the plan drawing list (canvas and sheets) holds one bowl and one drain for the sink', () => {
    const objects: ModelObject[] = [
      { id: F1, type: 'floor', data: { name: 'Floor 1', order: 1 } },
      sink(),
    ];
    const list = buildDrawingList(
      { objects },
      { level: F1, dimensionTextPt: 10, roomHatch: null, roomLabelPt: 11 },
    );
    const mine = list.items.filter((i) => i.objectId.toLowerCase() === SINK);
    expect(shape(mine)).toEqual(ONE_BOWL('new'));
  });

  it('AC-EZD-2045-1 an existing sink redraws the same way, on its own phase layer', () => {
    expect(shape(fixtureSymbolItems(sink({ x: 1, y: 0 }, 'existing'), 10))).toEqual(
      ONE_BOWL('existing'),
    );
  });

  it('AC-EZD-2045-1 turned to face right, the deck is against the back (x = 89) and the drain stays on the centre line', () => {
    // Axis +y: the back is -x, so the bowl runs x 100 - 6.6 = 93.4 to 100 + 8.8 = 108.8, y 35.48 to 64.52; drain
    // at (100 + 1.1, 50).
    const items = shape(fixtureSymbolItems(sink({ x: 0, y: 1 }), 10));
    expect(items.filter((i) => i[0] === 'arc')).toEqual([
      ['arc', 'new', 'beyond', p(101.1, 50), 1.5, 0, 360],
    ]);
    expect(items.slice(4, 8)).toEqual([
      ['line', 'new', 'beyond', p(93.4, 35.48), p(93.4, 64.52)],
      ['line', 'new', 'beyond', p(93.4, 64.52), p(108.8, 64.52)],
      ['line', 'new', 'beyond', p(108.8, 64.52), p(108.8, 35.48)],
      ['line', 'new', 'beyond', p(108.8, 35.48), p(93.4, 35.48)],
    ]);
  });

  it("AC-EZD-2045-2 the countertop cutout holds the whole bowl and the plumbing drain is on the bowl drain's centre line", () => {
    for (const axis of [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ]) {
      const s = sink(axis);
      const items = fixtureSymbolItems(s, 10);
      const cut = cutoutCorners(cutoutFromFixture('c1', { id: s.id, kind: 'sink', data: s.data }));
      // The cutout is the sink's own rectangle: its corners are the outline's.
      const outline = items.slice(0, 4).flatMap((i) => (i.kind === 'line' ? [pt(i.from)] : []));
      expect(cut.map(pt).sort((a, b) => a.x - b.x || a.y - b.y)).toEqual(
        [...outline].sort((a, b) => a.x - b.x || a.y - b.y),
      );
      for (const i of items.slice(4)) {
        if (i.kind === 'line') expect(pointInRing(i.from, cut)).toBe(true);
        if (i.kind === 'arc') expect(pointInRing(i.center, cut)).toBe(true);
      }

      const drains = items.flatMap((i) => (i.kind === 'arc' ? [i.center] : []));
      expect(drains).toHaveLength(1);
      const locs = plumbingLocations(s);
      expect(locs.filter((l) => l.kind === 'drain')).toHaveLength(1);
      const drain = locs.find((l) => l.kind === 'drain')!.point;
      // The centre line runs front to back through (100, 50): offset 0 along the axis for both drains.
      const along = (q: Point) => r((q.x - 100) * axis.x + (q.y - 50) * axis.y);
      expect(along(drain)).toBe(0);
      expect(along(drains[0]!)).toBe(0);
      // Hot and cold supply sit behind the one bowl, inside its width (±8" of ±14.52").
      for (const l of locs) expect(Math.abs(along(l.point))).toBeLessThan(14.52);
    }
  });
});

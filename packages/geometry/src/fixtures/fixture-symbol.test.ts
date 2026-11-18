// EZD-422 (AC-EZD-422-1, -3; Q-0705 standard drafting marks; Josh 2026-11-17 "the symbols need to be unique to each
// item"; vault/build/assumptions.md EZD-422). Every kind is drawn at one size (30" × 30") so two kinds giving the same
// symbol, or any kind giving the old outline-with-both-diagonals mark, fails. Expected values by hand: a 20" × 28"
// toilet at (0, 0) with axis +x has its back on y = 14 and its front on y = -14; its tank is the back 30% of the depth,
// y 5.6 to 14 across the full width x -10 to 10, and its bowl reaches the front at (0, -14).
import { describe, expect, it } from 'vitest';
import type { DrawingItem } from '../drawing/types';
import type { Point } from '../schema';
import { FIXTURE_KINDS, type FixtureKind } from '../schema/fixture';
import { fixtureSymbolItems, HOOD_DASH_IN } from './fixture-symbol';
import type { FixtureObject } from './fixtures';

const F1 = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
const fixture = (
  kind: FixtureKind,
  width = 30,
  depth = 30,
  axis: Point = { x: 1, y: 0 },
  center: Point = { x: 0, y: 0 },
): FixtureObject => ({
  id: `00000000-0000-4000-8000-${String(FIXTURE_KINDS.indexOf(kind) + 1).padStart(12, '0')}`,
  type: 'fixture',
  data: { geometry: { center, axis }, status: 'new', level: F1, attributes: { kind, width, depth } },
});

const r2 = (n: number) => (Math.round(n * 100) / 100 + 0).toFixed(2);
const key = (p: Point) => `${r2(p.x)},${r2(p.y)}`;

// An order-free fingerprint of a symbol: each item reduced to its shape, sorted.
function signature(items: DrawingItem[]): string {
  return items
    .map((i) => {
      if (i.kind === 'line') return `L ${i.role} ${[key(i.from), key(i.to)].sort().join(' ')}`;
      if (i.kind === 'arc') return `A ${i.role} ${key(i.center)} ${r2(i.radius)} ${i.startAngle} ${i.endAngle}`;
      if (i.kind === 'text') return `T ${i.text}`;
      return i.kind;
    })
    .sort()
    .join('|');
}

const corners = (w: number, d: number) => [
  { x: -w / 2, y: d / 2 },
  { x: w / 2, y: d / 2 },
  { x: w / 2, y: -d / 2 },
  { x: -w / 2, y: -d / 2 },
];
const same = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

describe('EZD-422 every fixture kind has its own plan symbol', () => {
  it('AC-3 no two of the 14 kinds draw the same symbol at one size', () => {
    expect(FIXTURE_KINDS).toHaveLength(14);
    const seen = new Map<string, FixtureKind>();
    for (const kind of FIXTURE_KINDS) {
      const s = signature(fixtureSymbolItems(fixture(kind), 10));
      expect(seen.get(s), `${kind} draws the same symbol as ${seen.get(s)}`).toBeUndefined();
      seen.set(s, kind);
    }
    expect(seen.size).toBe(14);
  });

  it('AC-3 no kind draws a diagonal of its outline (the old box-with-diagonals mark)', () => {
    const c = corners(30, 30);
    const old = signature(
      [0, 1, 2, 3, 0, 1].map((i, k) => ({
        layer: 'new',
        objectId: 'x',
        kind: 'line',
        role: 'beyond',
        from: c[i]!,
        to: k < 4 ? c[(i + 1) % 4]! : c[(i + 2) % 4]!,
      })),
    );
    for (const kind of FIXTURE_KINDS) {
      const items = fixtureSymbolItems(fixture(kind), 10);
      expect(signature(items), kind).not.toBe(old);
      for (const i of items) {
        if (i.kind !== 'line') continue;
        for (const [p, q] of [
          [c[0]!, c[2]!],
          [c[1]!, c[3]!],
        ] as const) {
          const joins = (same(i.from, p) && same(i.to, q)) || (same(i.from, q) && same(i.to, p));
          expect(joins, `${kind} draws an outline diagonal`).toBe(false);
        }
      }
    }
  });

  it('AC-1 every symbol stays inside its own width and depth, whichever way it faces', () => {
    for (const axis of [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
    ])
      for (const kind of FIXTURE_KINDS) {
        const w = 24;
        const d = 18;
        // Half-extents on the plan once turned: along x and y.
        const hx = (Math.abs(axis.x) * w + Math.abs(axis.y) * d) / 2 + 1e-6;
        const hy = (Math.abs(axis.y) * w + Math.abs(axis.x) * d) / 2 + 1e-6;
        const inside = (p: Point, r = 0) => Math.abs(p.x) + r <= hx && Math.abs(p.y) + r <= hy;
        for (const i of fixtureSymbolItems(fixture(kind, w, d, axis), 10)) {
          if (i.kind === 'line') expect(inside(i.from) && inside(i.to), kind).toBe(true);
          else if (i.kind === 'arc') expect(inside(i.center, i.radius), kind).toBe(true);
          else if (i.kind === 'text') expect(inside(i.at), kind).toBe(true);
        }
      }
  });

  it('AC-1 the toilet draws its tank against the back and its bowl toward the front, turned with its axis', () => {
    const lines = fixtureSymbolItems(fixture('toilet', 20, 28), 10).flatMap((i) =>
      i.kind === 'line' ? [[key(i.from), key(i.to)]] : [],
    );
    expect(lines.slice(0, 4)).toEqual([
      ['-10.00,14.00', '10.00,14.00'],
      ['10.00,14.00', '10.00,5.60'],
      ['10.00,5.60', '-10.00,5.60'],
      ['-10.00,5.60', '-10.00,14.00'],
    ]);
    expect(lines.slice(4).flat()).toContain('0.00,-14.00');
    // Facing +x (axis +y): the back is x = -14, the tank x -14 to -5.6.
    const turned = fixtureSymbolItems(fixture('toilet', 20, 28, { x: 0, y: 1 }), 10).flatMap((i) =>
      i.kind === 'line' ? [key(i.from)] : [],
    );
    expect(turned.slice(0, 4)).toEqual(['-14.00,-10.00', '-14.00,10.00', '-5.60,10.00', '-5.60,-10.00']);
    expect(turned).toContain('14.00,0.00');
  });

  it('AC-1 appliances carry their standard letters, readable whichever way they face; the water heater is a circle', () => {
    const letters = (kind: FixtureKind) =>
      fixtureSymbolItems(fixture(kind), 10).flatMap((i) => (i.kind === 'text' ? [i.text] : []));
    expect(letters('refrigerator')).toEqual(['REF']);
    expect(letters('dishwasher')).toEqual(['DW']);
    expect(letters('disposal')).toEqual(['GD']);
    expect(letters('washer')).toEqual(['W']);
    expect(letters('dryer')).toEqual(['D']);
    expect(letters('water_heater')).toEqual(['WH']);
    for (const kind of ['toilet', 'lavatory', 'tub', 'shower_prefab', 'sink', 'cooktop', 'range', 'hood'] as const)
      expect(letters(kind)).toEqual([]);

    const rotation = (axis: Point) =>
      fixtureSymbolItems(fixture('dishwasher', 24, 24, axis, { x: 5, y: 7 }), 10).flatMap((i) =>
        i.kind === 'text' ? [[i.rotationDeg, i.at, i.sizePt]] : [],
      );
    expect(rotation({ x: 1, y: 0 })).toEqual([[0, { x: 5, y: 7 }, 10]]);
    expect(rotation({ x: -1, y: 0 })).toEqual([[0, { x: 5, y: 7 }, 10]]);
    expect(rotation({ x: 0, y: 1 })).toEqual([[90, { x: 5, y: 7 }, 10]]);
    expect(rotation({ x: 0, y: -1 })).toEqual([[90, { x: 5, y: 7 }, 10]]);

    const wh = fixtureSymbolItems(fixture('water_heater', 22, 22), 10);
    expect(wh.filter((i) => i.kind === 'line')).toEqual([]);
    expect(wh.flatMap((i) => (i.kind === 'arc' ? [[i.center, i.radius, i.startAngle, i.endAngle]] : []))).toEqual([
      [{ x: 0, y: 0 }, 11, 0, 360],
    ]);
  });

  it('AC-1 cooktop and range draw four burners, the range also its outline; the hood is dashed', () => {
    const count = (kind: FixtureKind, k: DrawingItem['kind']) =>
      fixtureSymbolItems(fixture(kind, 30, 26), 10).filter((i) => i.kind === k).length;
    expect([count('cooktop', 'arc'), count('cooktop', 'line')]).toEqual([4, 0]);
    expect([count('range', 'arc'), count('range', 'line')]).toEqual([4, 4]);

    const hood = fixtureSymbolItems(fixture('hood', 30, 20), 10);
    expect(hood.every((i) => i.kind === 'line' && i.role === 'beyond')).toBe(true);
    const lengths = hood.map((i) => (i.kind === 'line' ? Math.hypot(i.to.x - i.from.x, i.to.y - i.from.y) : 0));
    expect(Math.max(...lengths)).toBeLessThanOrEqual(HOOD_DASH_IN + 1e-9);
    // Dashes cover less than the 100" perimeter: the gaps show.
    expect(lengths.reduce((s, l) => s + l, 0)).toBeLessThan(100);
  });

  it('AC-2 every item is in the fixture status layer, in the beyond line weight', () => {
    for (const kind of FIXTURE_KINDS) {
      const f = fixture(kind);
      f.data.status = 'demo';
      for (const i of fixtureSymbolItems(f, 10)) {
        expect(i.layer, kind).toBe('demo');
        expect(i.objectId).toBe(f.id);
        if (i.kind === 'line' || i.kind === 'arc') expect(i.role, kind).toBe('beyond');
      }
    }
  });
});

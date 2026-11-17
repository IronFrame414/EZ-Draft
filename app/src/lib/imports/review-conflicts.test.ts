// EZD-310 (AC-EZD-310-1 "A typed value beyond tolerance lists every conflict it creates"; S02 Conflict list,
// Validation; Round 24 #30). Expected values are worked by hand from the fixture below (a 20' x 15' room, +y north,
// +x east, corners walked SW -> SE -> NE -> NW) and the walk rule in vault/build/assumptions.md EZD-310.
import { describe, expect, it } from 'vitest';
import type { ReviewItem } from './review';
import { applyFix, parseFix, type Fixes } from './review-fix';
import {
  DEFAULT_MEASUREMENT_TOLERANCE_IN,
  isOverTolerance,
  itemConflicts,
  reviewTolerance,
  roomGaps,
  typedFix,
  typedOf,
} from './review-conflicts';

const wall = (id: string, side: 'north' | 'east' | 'south' | 'west', sx: number, sy: number, ex: number, ey: number) =>
  ({
    id,
    type: 'wall',
    number: 1,
    side,
    confidence: 60,
    geometry: { start: { x: sx, y: sy }, end: { x: ex, y: ey } },
    thickness: 4.5,
  }) as const;
const opening = (id: string, kind: 'door' | 'window', host: string, x: number, y: number, width: number) =>
  ({ id, type: 'opening', kind, number: 1, confidence: 60, hostWallId: host, width, center: { x, y } }) as const;

// South 240" (0,0)->(240,0); east 180" (240,0)->(240,180); north 240" drawn west->east (0,180)->(240,180), so it
// runs against the walk; west 180" (0,180)->(0,0). A partition crosses the room at x = 120.
const items: ReviewItem[] = [
  wall('s', 'south', 0, 0, 240, 0),
  wall('e', 'east', 240, 0, 240, 180),
  wall('n', 'north', 0, 180, 240, 180),
  wall('w', 'west', 0, 180, 0, 0),
  wall('p', 'north', 120, 0, 120, 180),
  opening('W1', 'window', 's', 120, 0, 36),
  opening('D1', 'door', 'e', 240, 90, 32),
  opening('W2', 'window', 'n', 120, 180, 36),
  opening('W3', 'window', 'w', 0, 90, 36),
  {
    id: 'r1',
    type: 'room',
    number: 1,
    confidence: 90,
    boundary: [
      { x: 0, y: 0 },
      { x: 240, y: 0 },
      { x: 240, y: 180 },
      { x: 0, y: 180 },
    ],
    closed: true,
    areaSqIn: 43200,
  },
];

const typed = (id: string, value: number, fixes: Fixes = {}): Fixes => {
  const item = items.find((i) => i.id === id)!;
  return { ...fixes, [id]: typedFix(applyFix(item, fixes[id]), value)! };
};
const TOL = 0.5;

describe('EZD-310 tolerance (S02 Data shown; Round 24 #30)', () => {
  it('reads the Defaults length; Not set falls back to 1/2"', () => {
    expect(DEFAULT_MEASUREMENT_TOLERANCE_IN).toBe(0.5);
    expect(reviewTolerance(null)).toBe(0.5);
    expect(reviewTolerance('x')).toBe(0.5);
    expect(reviewTolerance(0.125)).toBe(0.125);
    expect(reviewTolerance(0)).toBe(0);
  });

  it('a difference greater than the tolerance is a conflict; at the tolerance is not', () => {
    const e = items[1];
    expect(isOverTolerance(e, typed('e', 180.5), TOL)).toBe(false);
    expect(isOverTolerance(e, typed('e', 180.5625), TOL)).toBe(true);
    expect(isOverTolerance(e, typed('e', 179.4375), TOL)).toBe(true);
    expect(isOverTolerance(e, {}, TOL)).toBe(false);
  });
});

describe('EZD-310 typed value overrides the scan (S02 Typed or laser input)', () => {
  it('a typed wall keeps its start and its end moves along the wall; the typed value is kept in the fix', () => {
    const fixes = typed('e', 180.75);
    expect(fixes.e).toEqual({ geometry: { start: { x: 240, y: 0 }, end: { x: 240, y: 180.75 } }, typed: 180.75 });
    expect(typedOf(fixes.e)).toBe(180.75);
    const n = typed('n', 239);
    expect(n.n).toEqual({ geometry: { start: { x: 0, y: 180 }, end: { x: 239, y: 180 } }, typed: 239 });
  });

  it('a typed opening keeps its centre and takes the typed width', () => {
    expect(typed('W1', 37).W1).toEqual({ center: { x: 120, y: 0 }, width: 37, typed: 37 });
  });

  it('the typed value survives a save and reload (parseFix)', () => {
    const fixes = typed('e', 180.75);
    const back = parseFix(items[1], JSON.parse(JSON.stringify(fixes.e)));
    expect(typedOf(back ?? undefined)).toBe(180.75);
    expect(typedOf(parseFix(items[1], { geometry: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } }) ?? undefined)).toBe(
      null,
    );
  });
});

describe('EZD-310 conflict list (AC-EZD-310-1)', () => {
  it('east wall typed 3/4" long: the room no longer closes (gap at the southwest corner), D1 and W3 move; nothing else', () => {
    // Walk S, E, N, W from the SW corner. East +3/4" pushes N and W 3/4" north: the walk ends 3/4" north of the SW
    // corner. D1 is on the east wall (offset from its far corner +3/4"); W3 on the west wall moves 3/4" along it;
    // W2 on the north wall moves across its wall, not along it; W1 is before the change.
    expect(itemConflicts(items, typed('e', 180.75), 'e', TOL)).toEqual([
      { kind: 'gap', severity: 'error', id: 'r1', inches: 0.75, point: { x: 0, y: 0 }, corner: 'southwest' },
      { kind: 'opening_offset', severity: 'warning', id: 'D1', inches: 0.75, point: { x: 240, y: 90 } },
      { kind: 'opening_offset', severity: 'warning', id: 'W3', inches: 0.75, point: { x: 0, y: 90 } },
    ]);
  });

  it('north wall (drawn against the walk) typed 1" short: 1" gap at the southwest corner and W2; W3 moves across its wall', () => {
    expect(itemConflicts(items, typed('n', 239), 'n', TOL)).toEqual([
      { kind: 'gap', severity: 'error', id: 'r1', inches: 1, point: { x: 0, y: 0 }, corner: 'southwest' },
      { kind: 'opening_offset', severity: 'warning', id: 'W2', inches: 1, point: { x: 120, y: 180 } },
    ]);
  });

  it('within or at the tolerance lists nothing', () => {
    expect(itemConflicts(items, typed('e', 180.25), 'e', TOL)).toEqual([]);
    expect(itemConflicts(items, typed('e', 180.5), 'e', TOL)).toEqual([]);
    expect(itemConflicts(items, {}, 'e', TOL)).toEqual([]);
  });

  it('typed lengths that add up close the room: south and north both 3/4" long leave no gap', () => {
    const fixes = typed('n', 240.75, typed('s', 240.75));
    // South +3/4" east; north runs west in the walk, +3/4" west: they cancel. W1 is on the south wall; W2 on the
    // north wall (later in the walk) moves 3/4" along it.
    expect(itemConflicts(items, fixes, 's', TOL)).toEqual([
      { kind: 'opening_offset', severity: 'warning', id: 'W1', inches: 0.75, point: { x: 120, y: 0 } },
      { kind: 'opening_offset', severity: 'warning', id: 'W2', inches: 0.75, point: { x: 120, y: 180 } },
    ]);
    expect(roomGaps(items, fixes, TOL)).toEqual([]);
  });

  it('a gap within the tolerance is not listed', () => {
    // South +3/4", north +1/2" (both in the walk's opposite directions): the walk misses by 1/4".
    const fixes = typed('n', 240.5, typed('s', 240.75));
    expect(roomGaps(items, fixes, TOL)).toEqual([]);
    expect(itemConflicts(items, fixes, 's', TOL).map((c) => c.kind)).toEqual(['opening_offset', 'opening_offset']);
  });

  it('a typed opening width moves each edge by half the change', () => {
    expect(itemConflicts(items, typed('W1', 37), 'W1', TOL)).toEqual([
      { kind: 'opening_offset', severity: 'warning', id: 'W1', inches: 0.5, point: { x: 120, y: 0 } },
    ]);
    expect(itemConflicts(items, typed('W1', 36.5), 'W1', TOL)).toEqual([]);
  });

  it('a partition across the room is not part of its walk: typed, it leaves the room closed', () => {
    expect(itemConflicts(items, typed('p', 182), 'p', TOL)).toEqual([]);
    expect(roomGaps(items, typed('p', 182), TOL)).toEqual([]);
  });

  it('roomGaps reports the open room with its size and corner (the canvas gap marker)', () => {
    expect(roomGaps(items, typed('e', 180.75), TOL)).toEqual([
      { roomId: 'r1', inches: 0.75, point: { x: 0, y: 0 }, corner: 'southwest' },
    ]);
  });
});

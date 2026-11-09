// EZD-204b F1-F6 (vault/plans/EZD-204b.md sections 3, 4; AC-EZD-204-7, -8, -9, -10, -11, -13): host corners,
// offsets, On a wall and placing at a typed offset. Expected values: Q-0630 rows 1, 5, 14; Q-0640; Q-0641 row 1;
// 09k On a wall, Partial overhang, Offset rows, Exact fit, Tee; 03g rows 2-3, 7-8 (1/64" inclusive, typed to 1/16).
import { describe, expect, it } from 'vitest';
import { formatLength, parseLength } from '../length';
import type { Point } from '../schema';
import {
  deepFreeze,
  ID,
  LEVEL_2,
  partition,
  roomWalls,
  wallObj,
} from '../walls/test-utils/fixtures';
import type { WallObject } from '../walls';
import { createOpeningData, type OpeningObject } from './opening';
import {
  hostCorners,
  openingOffsets,
  openingOnWall,
  placeAtOffset,
  type OpeningOffsets,
  type PlaceAtOffsetInput,
  type PlaceAtOffsetResult,
} from './offsets';

const P = (x: number, y: number): Point => ({ x, y });
const E = '00000000-0000-4000-8000-0000000000e1';

const W1 = (): WallObject => wallObj(ID.W1, P(0, 0), P(144, 0));

function zeroWall(): WallObject {
  const w = wallObj(ID.Z, P(5, 5), P(6, 5));
  return { ...w, data: { ...w.data, geometry: { start: P(5, 5), end: P(5, 5) } } };
}

function door(host: WallObject, center: Point, id: string = ID.D1): OpeningObject {
  return deepFreeze({
    id,
    type: 'opening',
    data: createOpeningData({ kind: 'door', host, center }),
  });
}

function expectPt(got: Point, x: number, y: number): void {
  expect(got.x).toBeCloseTo(x, 9);
  expect(got.y).toBeCloseTo(y, 9);
}

function expectCenter(r: PlaceAtOffsetResult, x: number, y: number): Point {
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error('placeAtOffset refused');
  expectPt(r.center, x, y);
  return r.center;
}

function okCenter(r: PlaceAtOffsetResult): Point {
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error('placeAtOffset refused');
  return r.center;
}

function expectOffsets(got: OpeningOffsets | null, left: number, right: number): OpeningOffsets {
  expect(got).not.toBeNull();
  if (got === null) throw new Error('openingOffsets returned null');
  expect(got.left).toBeCloseTo(left, 9);
  expect(got.right).toBeCloseTo(right, 9);
  return got;
}

const place = (input: PlaceAtOffsetInput): PlaceAtOffsetResult => placeAtOffset(deepFreeze(input));

describe('EZD-204b offsets', () => {
  it('EZD-204b F1 on a wall', () => {
    const d72 = door(W1(), P(72, 0));
    const near = [-0.015625, -0.0157, -6].map((y) =>
      openingOnWall(d72, deepFreeze(wallObj(ID.W1, P(0, y), P(144, y)))),
    );
    expect(near).toEqual([true, false, false]);

    const w132 = deepFreeze(wallObj(ID.W1, P(0, 0), P(132, 0)));
    expect(openingOnWall(door(W1(), P(118, 0)), w132)).toBe(false);
    expect(openingOnWall(door(W1(), P(114, 0)), w132)).toBe(true);

    const upper = deepFreeze(wallObj(ID.W1, P(0, 0), P(144, 0), { level: LEVEL_2 }));
    expect(openingOnWall(d72, upper)).toBe(false);

    expect(openingOnWall(d72, deepFreeze(zeroWall()))).toBe(false);

    const w1 = deepFreeze(W1());
    const ends = [18, 17.984375, 17.9375].map((x) => openingOnWall(door(W1(), P(x, 0)), w1));
    expect(ends).toEqual([true, true, false]);
  });

  it('EZD-204b F2 offsets on a 144 inch wall', () => {
    const host = deepFreeze(W1());
    const walls = [host];
    const base = { host, walls, openings: [], width: 36, near: P(72, 0), ignoreId: null };

    const c36 = expectCenter(place({ ...base, side: 'left', offset: 36 }), 54, 0);
    const c0 = expectCenter(place({ ...base, side: 'left', offset: 0 }), 18, 0);
    const c108 = expectCenter(place({ ...base, side: 'left', offset: 108 }), 126, 0);
    expect(place({ ...base, side: 'left', offset: 108.0625 })).toEqual({
      ok: false,
      reason: 'past_corner',
    });
    const r36 = expectCenter(place({ ...base, side: 'right', offset: 36 }), 90, 0);

    const want: [Point, number, number][] = [
      [c36, 36, 72],
      [c0, 0, 108],
      [c108, 108, 0],
      [r36, 72, 36],
    ];
    for (const [c, left, right] of want) {
      const got = expectOffsets(openingOffsets(door(host, c), host, walls), left, right);
      expect(got.leftCorner).toEqual({ at: 0, wallId: null });
      expect(got.rightCorner.wallId).toBeNull();
      expect(got.rightCorner.at).toBeCloseTo(144, 9);
    }
  });

  it('EZD-204b F3 exact fit and overlap', () => {
    const host = deepFreeze(W1());
    const walls = [host];
    const e = door(host, P(98, 0), E);
    const base = { host, walls, width: 36, near: P(40, 0), side: 'left' as const };

    expectCenter(place({ ...base, openings: [e], offset: 44, ignoreId: null }), 62, 0);
    expectCenter(
      place({ ...base, openings: [e], offset: 44.015625, ignoreId: null }),
      62.015625,
      0,
    );
    expect(place({ ...base, openings: [e], offset: 44.0625, ignoreId: null })).toEqual({
      ok: false,
      reason: 'overlap',
    });
    expectCenter(place({ ...base, openings: [e], offset: 44.0625, ignoreId: E }), 62.0625, 0);

    const onW2 = door(host, P(62, 0));
    const otherWall: OpeningObject = deepFreeze({
      ...onW2,
      data: { ...onW2.data, geometry: { ...onW2.data.geometry, hostWallId: ID.W2 } },
    });
    expectCenter(place({ ...base, openings: [otherWall], offset: 44, ignoreId: null }), 62, 0);

    const short = deepFreeze(wallObj(ID.W1, P(0, 0), P(36, 0)));
    const fit = {
      host: short,
      walls: [short],
      openings: [],
      near: P(18, 0),
      side: 'left' as const,
    };
    expectCenter(place({ ...fit, offset: 0, width: 36, ignoreId: null }), 18, 0);
    expect(place({ ...fit, offset: 0, width: 36.0625, ignoreId: null })).toEqual({
      ok: false,
      reason: 'past_corner',
    });
  });

  it('EZD-204b F4 tee faces are corners', () => {
    const walls = deepFreeze([...roomWalls(144, 120), partition(60)]);
    const host = walls[0]!;
    const corners = hostCorners(host, walls);
    const want: [number, string][] = [
      [0, ID.W4],
      [57.75, ID.P],
      [62.25, ID.P],
      [144, ID.W2],
    ];
    expect(corners).toHaveLength(4);
    want.forEach(([at, wallId], i) => {
      expect(corners[i]!.at).toBeCloseTo(at, 9);
      expect(corners[i]!.wallId).toBe(wallId);
    });

    const base = { host, walls, openings: [], width: 36, side: 'left' as const, ignoreId: null };
    const c = expectCenter(place({ ...base, near: P(100, 0), offset: 24 }), 104.25, 0);
    const got = expectOffsets(openingOffsets(door(host, c), host, walls), 24, 21.75);
    expect(got.leftCorner.wallId).toBe(ID.P);
    expect(got.rightCorner.wallId).toBe(ID.W2);
    expect(formatLength(got.right, 2)).toBe(`1' 10"`);

    expect(place({ ...base, near: P(20, 0), offset: 22 })).toEqual({
      ok: false,
      reason: 'past_corner',
    });
  });

  it('EZD-204b F5 typed offsets round to 1/16', () => {
    const host = deepFreeze(W1());
    const walls = [host];
    const base = { host, walls, openings: [], width: 36, near: P(72, 0), side: 'left' as const };
    const typed = (text: string): number => {
      const r = parseLength(text, 'other');
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error(`parseLength refused ${text}`);
      return r.inches;
    };

    const a = typed('36.03"');
    expect(a).toBe(36);
    const ca = okCenter(place({ ...base, offset: a, ignoreId: null }));
    expectOffsets(openingOffsets(door(host, ca), host, walls), 36, 72);

    const b = typed('36.03125"');
    expect(b).toBe(36.0625);
    const cb = okCenter(place({ ...base, offset: b, ignoreId: null }));
    const got = expectOffsets(openingOffsets(door(host, cb), host, walls), 36.0625, 71.9375);
    expect(formatLength(got.left, 2)).toBe(`3' 0"`);
    expect(formatLength(got.right, 2)).toBe(`6' 0"`);
  });

  it('EZD-204b F6 bad input, vertical and reversed walls', () => {
    const host = deepFreeze(W1());
    const zero = deepFreeze(zeroWall());
    const base: PlaceAtOffsetInput = {
      host,
      walls: [host],
      openings: [],
      width: 36,
      near: P(72, 0),
      side: 'left',
      offset: 36,
      ignoreId: null,
    };
    const bad: PlaceAtOffsetInput[] = [
      { ...base, width: 0 },
      { ...base, width: -1 },
      { ...base, width: NaN },
      { ...base, offset: -0.0625 },
      { ...base, offset: NaN },
      { ...base, offset: Infinity },
      { ...base, near: P(NaN, 0) },
      { ...base, host: zero, walls: [zero] },
    ];
    expect(bad).toHaveLength(8);
    for (const input of bad) {
      expect(place(input)).toEqual({ ok: false, reason: 'invalid_input' });
    }

    expect(openingOffsets(door(host, P(72, 6)), host, [host])).toBeNull();
    expect(hostCorners(zero, [zero])).toEqual([]);

    const up = deepFreeze(wallObj(ID.W1, P(0, 0), P(0, 120)));
    const cu = expectCenter(
      place({ ...base, host: up, walls: [up], near: P(0, 60), offset: 12 }),
      0,
      90,
    );
    expectOffsets(openingOffsets(door(up, cu), up, [up]), 12, 72);

    const back = deepFreeze(wallObj(ID.W1, P(144, 0), P(0, 0)));
    const cb = expectCenter(
      place({ ...base, host: back, walls: [back], near: P(72, 0), offset: 36 }),
      54,
      0,
    );
    expectOffsets(openingOffsets(door(back, cb), back, [back]), 36, 72);
  });
});

// EZD-211a G2-G6 (vault/plans/EZD-211a.md sections 1 Decided "doorSymbolInFrame", "doorSymbol", "swingSideOf",
// "openingPreview", "withOpeningSize", "doorTargetAt", "openingOwnedAt"; 3; 4). Expected values: 09k Offset zero,
// maximum; Q-0630 09 rows 1, 3; Q-0641 rows 1, 3; Q-0633 G12; S03d E (44 px targets); P204b Door symbol; L-052.
import { describe, expect, it } from 'vitest';
import { buildDrawingList, type DrawingItem, type DrawingView } from '../index';
import type { OpeningData, Point } from '../schema';
import type { WallObject } from '../walls';
import { deepFreeze, ID, LEVEL_1, roomWalls, wallObj } from '../walls/test-utils/fixtures';
import { doorSymbol } from './door-symbol';
import { openingOffsets } from './offsets';
import { createOpeningData, type OpeningObject } from './opening';
import {
  DOOR_TARGET_PX,
  PRESS_MOVE_PX,
  doorTargetAt,
  openingOwnedAt,
  openingPreview,
  swingSideOf,
  withOpeningSize,
} from './placement';

const P = (x: number, y: number): Point => ({ x, y });
const walls = (): WallObject[] => roomWalls(144, 120);
const W1 = (): WallObject => walls()[0]!;
const asObj = (data: OpeningData): OpeningObject => ({ id: ID.D1, type: 'opening', data });

const door = (
  host: WallObject,
  center: Point,
  swing: 'left' | 'right',
  hand: 'left' | 'right' = 'left',
): OpeningObject => {
  const data = createOpeningData({ kind: 'door', host, center, swing });
  return asObj({ ...data, attributes: { ...data.attributes, hand } });
};
const flagged = (o: OpeningObject): OpeningObject => ({
  ...o,
  data: { ...o.data, geometry: { ...o.data.geometry, hostWallId: null, axis: { x: 1, y: 0 } } },
});

const preview = (
  point: Point,
  opts: {
    host?: WallObject;
    walls?: WallObject[];
    openings?: OpeningObject[];
    width?: number;
  } = {},
) =>
  openingPreview({
    kind: 'door',
    host: opts.host ?? W1(),
    walls: opts.walls ?? walls(),
    openings: opts.openings ?? [],
    point,
    width: opts.width ?? 36,
    flipped: false,
  });

const deg = (a: number) => (a * Math.PI) / 180;
const polar = (c: Point, r: number, aDeg: number): Point => ({
  x: c.x + r * Math.cos(deg(aDeg)),
  y: c.y + r * Math.sin(deg(aDeg)),
});
const closePt = (actual: Point, expected: Point) => {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
};

// V1 of G/drawing/build.test.ts, copied with level LEVEL_1 instead of F1.
const V1: DrawingView = {
  level: LEVEL_1,
  dimensionTextPt: 6.75,
  roomHatch: { angleDeg: 45, spacingIn: 6 },
  roomLabelPt: 11.25,
};

describe('EZD-211a opening placement geometry', () => {
  it('EZD-211a G2 preview follows, clamps and refuses', () => {
    const cases: Array<[Point, Point, number, number]> = [
      [P(60, 5), P(60, 0), 42, 66],
      [P(10, 5), P(18, 0), 0, 108],
      [P(140, 5), P(126, 0), 108, 0],
    ];
    for (const [point, center, left, right] of cases) {
      const r = preview(point);
      expect(r.ok, JSON.stringify(point)).toBe(true);
      if (!r.ok) continue;
      expect(r.data.geometry.center).toEqual(center);
      const off = openingOffsets(asObj(r.data), W1(), walls());
      expect({ left: off?.left, right: off?.right }).toEqual({ left, right });
    }

    const short = wallObj(ID.W1, P(0, 0), P(30, 0));
    expect(preview(P(15, 5), { host: short, walls: [short] })).toEqual({
      ok: false,
      reason: 'past_corner',
    });

    const other = asObj(createOpeningData({ kind: 'door', host: W1(), center: P(48, 0) }));
    expect(preview(P(60, 5), { openings: [other] })).toEqual({ ok: false, reason: 'overlap' });

    const vertical = wallObj(ID.W1, P(0, 0), P(0, 120));
    const v = preview(P(0, 30), { host: vertical, walls: [vertical] });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.data.geometry.center).toEqual(P(0, 30));
      const off = openingOffsets(asObj(v.data), vertical, [vertical]);
      expect({ left: off?.left, right: off?.right }).toEqual({ left: 72, right: 12 });
    }

    expect(swingSideOf(W1(), P(60, 5))).toBe('left');
    expect(swingSideOf(W1(), P(60, -5))).toBe('right');
    expect(swingSideOf(W1(), P(60, 0))).toBe('left');
  });

  it('EZD-211a G3 bad input', () => {
    expect(preview(P(NaN, 0))).toEqual({ ok: false, reason: 'invalid_input' });
    expect(preview(P(60, 5), { width: 0 })).toEqual({ ok: false, reason: 'invalid_input' });
    expect(preview(P(60, 5), { width: NaN })).toEqual({ ok: false, reason: 'invalid_input' });

    const win = asObj(createOpeningData({ kind: 'window', host: W1(), center: P(54, 0) }));
    const d = door(W1(), P(54, 0), 'left');
    expect(doorSymbol(win, W1())).toBeNull();
    expect(doorSymbol(d, walls()[1]!)).toBeNull();
    expect(doorSymbol(d, null)).toBeNull();

    expect(doorTargetAt(d, null, P(54, 0), 8.25)).toBeNull();
    expect(openingOwnedAt(d, null, P(54, 0), 3.75, 8.25)).toBe(false);

    const frozen = deepFreeze(createOpeningData({ kind: 'door', host: W1(), center: P(54, 0) }));
    let out: OpeningData | undefined;
    expect(() => {
      out = withOpeningSize(frozen, { width: 32, height: 80 });
    }).not.toThrow();
    expect(out).not.toBe(frozen);
    expect(frozen.attributes.width).toBe(36);
  });

  it('EZD-211a G4 rough opening follows size until typed', () => {
    const autoDoor = createOpeningData({ kind: 'door', host: W1(), center: P(54, 0) });
    const a = withOpeningSize(autoDoor, { width: 32, height: 80 });
    expect(a.attributes.roughOpening).toEqual({ width: 34, height: 82.5 });

    const typedDoor: OpeningData = {
      ...autoDoor,
      attributes: {
        ...autoDoor.attributes,
        roughOpeningMode: 'typed',
        roughOpening: { width: 40, height: 84 },
      },
    };
    const t = withOpeningSize(typedDoor, { width: 32, height: 80 });
    expect(t.attributes.width).toBe(32);
    expect(t.attributes.roughOpening).toEqual({ width: 40, height: 84 });

    const autoWindow = createOpeningData({ kind: 'window', host: W1(), center: P(54, 0) });
    const w = withOpeningSize(autoWindow, { width: 24, height: 36 });
    expect(w.attributes.roughOpening).toEqual({ width: 24.5, height: 36.5 });
  });

  it('EZD-211a G5 doorSymbol is the drawn door', () => {
    const variants: Array<{
      name: string;
      wall: WallObject;
      door: OpeningObject;
      hinge: Point;
      leafEnd: Point;
      start: number;
      end: number;
    }> = [];
    const right = wallObj(ID.W1, P(0, 0), P(144, 0), { thicknessSide: 'right' });
    const left = wallObj(ID.W1, P(0, 0), P(144, 0), { thicknessSide: 'left' });
    const center = wallObj(ID.W1, P(0, 0), P(144, 0), { thicknessSide: 'center' });
    variants.push(
      {
        name: 'right',
        wall: right,
        door: door(right, P(54, 0), 'left', 'left'),
        hinge: P(36, 0),
        leafEnd: P(36, 36),
        start: 0,
        end: 90,
      },
      {
        name: 'left',
        wall: left,
        door: door(left, P(54, 0), 'left', 'left'),
        hinge: P(36, 4.5),
        leafEnd: P(36, 40.5),
        start: 0,
        end: 90,
      },
      {
        name: 'center',
        wall: center,
        door: door(center, P(54, 0), 'right', 'right'),
        hinge: P(72, -2.25),
        leafEnd: P(72, -38.25),
        start: 180,
        end: 270,
      },
      {
        name: 'flagged',
        wall: right,
        door: flagged(door(right, P(54, 0), 'left', 'left')),
        hinge: P(36, 0),
        leafEnd: P(36, 36),
        start: 0,
        end: 90,
      },
    );
    for (const v of variants) {
      const host = v.door.data.geometry.hostWallId === null ? null : v.wall;
      const s = doorSymbol(v.door, host);
      expect(s, v.name).not.toBeNull();
      if (s === null) continue;
      closePt(s.hinge, v.hinge);
      closePt(s.leafEnd, v.leafEnd);
      expect(s.startAngle).toBeCloseTo(v.start, 9);
      expect(s.endAngle).toBeCloseTo(v.end, 9);

      const items: DrawingItem[] = buildDrawingList({ objects: [v.wall, v.door] }, V1).items;
      const k = items.findIndex((i) => i.kind === 'arc' && i.objectId === ID.D1);
      expect(k, v.name).toBeGreaterThan(0);
      const arc = items[k]!;
      const leaf = items[k - 1]!;
      if (arc.kind !== 'arc' || leaf.kind !== 'line')
        throw new Error(`${v.name}: arc or leaf missing`);
      closePt(arc.center, s.hinge);
      expect(arc.radius).toBeCloseTo(36, 9);
      expect(arc.startAngle).toBeCloseTo(s.startAngle, 9);
      expect(arc.endAngle).toBeCloseTo(s.endAngle, 9);
      expect(leaf.role).toBe('cut');
      closePt(leaf.from, s.hinge);
      closePt(leaf.to, s.leafEnd);
    }
  });

  it('EZD-211a G6 arc, dot and owned area', () => {
    expect(DOOR_TARGET_PX).toBe(22);
    expect(PRESS_MOVE_PX).toBe(10);
    const d = door(W1(), P(54, 0), 'left', 'left');
    const hinge = P(36, 0);
    const M = P(36 + 36 * Math.cos(deg(45)), 36 * Math.sin(deg(45)));
    const win = asObj(createOpeningData({ kind: 'window', host: W1(), center: P(54, 0) }));

    const target = (p: Point) => doorTargetAt(d, W1(), p, 8.25);
    expect(target(P(36, 0))).toBe('dot');
    expect(target(P(44, 0))).toBe('dot');
    expect(target(P(45, 0))).toBeNull();
    expect(target(M)).toBe('arc');
    expect(target(polar(hinge, 45, 45))).toBeNull();
    expect(target(polar(hinge, 36, 225))).toBeNull();
    expect(doorTargetAt(win, W1(), win.data.geometry.center, 8.25)).toBeNull();

    const owned = (p: Point) => openingOwnedAt(d, W1(), p, 3.75, 8.25);
    expect(owned(P(54, 0))).toBe(true);
    expect(owned(P(54, 30))).toBe(true);
    expect(owned(P(54, -8))).toBe(true);
    expect(owned(P(54, -9))).toBe(false);
    expect(owned(P(100, 0))).toBe(false);
    expect(owned(P(54, -40))).toBe(false);
    expect(owned(polar(hinge, 42, 45))).toBe(true);
  });
});

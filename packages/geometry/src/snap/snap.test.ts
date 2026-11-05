// EZD-206 · tests N1-N20 (vault/plans/EZD-206.md section 4).
import { describe, expect, it } from 'vitest';
import { ID, wallObj } from '../walls/test-utils/fixtures';
import { createWallSnapIndex } from './wall-snap-index';
import { DEFAULT_SNAP_SETTINGS, snap, type SnapRequest, type SnapSettings } from './snap';

type Pt = { x: number; y: number };
type Toggle = 'endpoints' | 'midpoints' | 'faces' | 'angles' | 'increment';

const deg = Math.PI / 180;
const center = { thicknessSide: 'center' as const };
const C = wallObj(ID.W1, { x: 0, y: 0 }, { x: 120, y: 0 }, center);

function ONLY(kinds: Toggle[], incrementIn = 0.5): SnapSettings {
  return {
    endpoints: kinds.includes('endpoints'),
    midpoints: kinds.includes('midpoints'),
    faces: kinds.includes('faces'),
    angles: kinds.includes('angles'),
    increment: kinds.includes('increment'),
    incrementIn,
  };
}

function at(a: number, len = 100): Pt {
  return { x: len * Math.cos(a * deg), y: len * Math.sin(a * deg) };
}

function req(cursor: Pt, o: Partial<SnapRequest> = {}): SnapRequest {
  return { cursor, pixelsPerInch: 1, anchor: null, referenceDirection: null, ...o };
}

function near(p: Pt, x: number, y: number) {
  expect(p.x).toBeCloseTo(x, 9);
  expect(p.y).toBeCloseTo(y, 9);
}

function grid3000() {
  return Array.from({ length: 3000 }, (_, k) => {
    const x = 200 * (k % 50);
    const y = 200 * Math.floor(k / 50);
    return wallObj(`w${String(k).padStart(4, '0')}`, { x, y }, { x: x + 100, y }, center);
  });
}

const one = (...w: ReturnType<typeof wallObj>[]) => createWallSnapIndex(w);
const none = () => createWallSnapIndex([]);
const ALL3 = ONLY(['endpoints', 'midpoints', 'faces']);
const ORIGIN = { x: 0, y: 0 };
const EAST = { x: 1, y: 0 };

describe('EZD-206 snapping', () => {
  it('N1 endpoint 6 pixels away snaps (09j row 1)', () => {
    const res = snap(one(C), req({ x: -3, y: 0 }, { pixelsPerInch: 2 }));
    expect(res).toEqual({ point: { x: 0, y: 0 }, kind: 'endpoint', wallId: ID.W1 });
  });

  it('N2 15 pixels from every object point: increment applies (09j row 2)', () => {
    const res = snap(
      one(C),
      req(
        { x: 30.3, y: 17.25 },
        { anchor: { x: 0, y: 17.25 }, settings: ONLY(['endpoints', 'midpoints', 'faces', 'increment']) },
      ),
    );
    near(res.point, 30.5, 17.25);
    expect(res.kind).toBe('increment');
    expect(res.wallId).toBeNull();
  });

  it('N3 endpoint beats midpoint, both 6 pixels (09j row 3)', () => {
    const ix = one(wallObj(ID.W1, { x: 0, y: 0 }, { x: 12, y: 0 }, center));
    for (const cx of [3, 3.5]) {
      const res = snap(ix, req({ x: cx, y: 4 }, { pixelsPerInch: 1.2 }));
      expect(res).toEqual({ point: { x: 0, y: 0 }, kind: 'endpoint', wallId: ID.W1 });
    }
  });

  it('N4 nearest endpoint wins; a tie goes to the lower id, then start', () => {
    const w2 = wallObj(ID.W2, { x: 0, y: 10 }, { x: 120, y: 10 }, center);
    const ix = createWallSnapIndex([w2, C]);
    for (const cy of [4, 5]) {
      const res = snap(ix, req({ x: 0, y: cy }));
      expect(res).toEqual({ point: { x: 0, y: 0 }, kind: 'endpoint', wallId: ID.W1 });
    }
    const short = one(wallObj(ID.W1, { x: 0, y: 0 }, { x: 12, y: 0 }, center));
    const res = snap(short, req({ x: 6, y: 8 }, { settings: ONLY(['endpoints']) }));
    expect(res).toEqual({ point: { x: 0, y: 0 }, kind: 'endpoint', wallId: ID.W1 });
  });

  it('N5 midpoint snaps', () => {
    const res = snap(one(C), req({ x: 62, y: 6 }));
    expect(res).toEqual({ point: { x: 60, y: 0 }, kind: 'midpoint', wallId: ID.W1 });
  });

  it('N6 face snaps to the finished face', () => {
    const ix = one(C);
    let res = snap(ix, req({ x: 30, y: 8 }));
    near(res.point, 30, 2.25);
    expect(res.kind).toBe('face');
    res = snap(ix, req({ x: 90, y: -9 }));
    near(res.point, 90, -2.25);
    expect(res.kind).toBe('face');
    const right = one(wallObj(ID.W1, { x: 0, y: 0 }, { x: 120, y: 0 }, { thicknessSide: 'right' }));
    res = snap(right, req({ x: 30, y: -8 }));
    near(res.point, 30, -4.5);
    expect(res.kind).toBe('face');
  });

  it('N7 87 degrees from the last wall snaps to 90 (09j row 4)', () => {
    const o = { anchor: ORIGIN, referenceDirection: EAST, settings: ONLY(['angles']) };
    let res = snap(none(), req(at(87), o));
    near(res.point, 0, 100 * Math.cos(3 * deg));
    expect(res.kind).toBe('angle');
    res = snap(none(), req(at(-87), o));
    near(res.point, 0, -100 * Math.cos(3 * deg));
    expect(res.kind).toBe('angle');
  });

  it('N8 43 degrees snaps to 45 (09j row 5)', () => {
    const o = { anchor: ORIGIN, referenceDirection: EAST, settings: ONLY(['angles']) };
    const res = snap(none(), req(at(43), o));
    const v = 100 * Math.cos(2 * deg) * Math.SQRT1_2;
    near(res.point, v, v);
    expect(res.kind).toBe('angle');
  });

  it('N9 80 degrees does not snap (09j row 6)', () => {
    const o = { anchor: ORIGIN, referenceDirection: EAST, settings: ONLY(['angles']) };
    const cursor = at(80);
    const res = snap(none(), req(cursor, o));
    expect(res.point).toEqual(cursor);
    expect(res.point).not.toBe(cursor);
    expect(res.kind).toBeNull();
  });

  it('N10 first wall measures from the page', () => {
    const s = ONLY(['angles']);
    let res = snap(none(), req(at(2), { anchor: ORIGIN, settings: s }));
    near(res.point, 100 * Math.cos(2 * deg), 0);
    expect(res.kind).toBe('angle');
    res = snap(none(), req(at(178), { anchor: ORIGIN, settings: s }));
    near(res.point, -100 * Math.cos(2 * deg), 0);
    expect(res.kind).toBe('angle');
    res = snap(none(), req(at(2), { anchor: ORIGIN, referenceDirection: { x: 0, y: 0 }, settings: s }));
    near(res.point, 100 * Math.cos(2 * deg), 0);
    expect(res.kind).toBe('angle');
    const cursor = at(87);
    res = snap(none(), req(cursor, { anchor: null, referenceDirection: EAST, settings: s }));
    expect(res.point).toEqual(cursor);
    expect(res.kind).toBeNull();
  });

  it('N11 angle measures from the last wall, not the page', () => {
    const ref = { x: Math.cos(30 * deg), y: Math.sin(30 * deg) };
    const res = snap(none(), req(at(118), { anchor: ORIGIN, referenceDirection: ref, settings: ONLY(['angles']) }));
    const k = 100 * Math.cos(2 * deg);
    near(res.point, k * -0.5, k * Math.sin(60 * deg));
    expect(res.kind).toBe('angle');
  });

  it('N12 no snap back onto the last wall', () => {
    const cursor = at(178);
    const res = snap(none(), req(cursor, { anchor: ORIGIN, referenceDirection: EAST, settings: ONLY(['angles']) }));
    expect(res.point).toEqual(cursor);
    expect(res.kind).toBeNull();
  });

  it('N13 increment: 37.3" to 37 1/2", 37.2" to 37", 37.25" to 37 1/2" (09j rows 7, 8)', () => {
    const cases: [number, number][] = [
      [37.3, 37.5],
      [37.2, 37],
      [37.25, 37.5],
    ];
    for (const [cx, ex] of cases) {
      const res = snap(none(), req({ x: cx, y: 0 }, { anchor: ORIGIN, settings: ONLY(['increment']) }));
      near(res.point, ex, 0);
      expect(res.kind).toBe('increment');
    }
  });

  it('N14 increment rounds the length along the direction', () => {
    const res = snap(none(), req(at(30, 37.3), { anchor: ORIGIN, settings: ONLY(['increment']) }));
    near(res.point, 37.5 * Math.cos(30 * deg), 37.5 * Math.sin(30 * deg));
  });

  it('N15 changing the increment changes snapping', () => {
    const cursor = { x: 37.3, y: 0 };
    let res = snap(none(), req(cursor, { anchor: ORIGIN, settings: ONLY(['increment'], 1) }));
    near(res.point, 37, 0);
    res = snap(none(), req(cursor, { anchor: ORIGIN, settings: ONLY(['increment'], 0.25) }));
    near(res.point, 37.25, 0);
  });

  it('N16 angle and increment combine', () => {
    const res = snap(none(), req(at(87, 37.3), { anchor: ORIGIN, referenceDirection: EAST }));
    near(res.point, 0, 37);
    expect(res.kind).toBe('angle');
  });

  it('N17 first click snaps each coordinate to the increment', () => {
    let res = snap(none(), req({ x: 10.3, y: -4.2 }));
    near(res.point, 10.5, -4);
    expect(res.kind).toBe('increment');
    res = snap(none(), req({ x: 0.25, y: -0.25 }));
    near(res.point, 0.5, 0);
    expect(res.kind).toBe('increment');
  });

  it('N18 capture is 10 pixels, inclusive, scaled by zoom', () => {
    const ix = one(C);
    const cases: [number, number, boolean][] = [
      [1, -10, true],
      [1, -10.5, false],
      [0.5, -19, true],
      [2, -6, false],
    ];
    for (const [ppi, cx, hit] of cases) {
      const cursor = { x: cx, y: 0 };
      const res = snap(ix, req(cursor, { pixelsPerInch: ppi, settings: ALL3 }));
      if (hit) {
        expect(res).toEqual({ point: { x: 0, y: 0 }, kind: 'endpoint', wallId: ID.W1 });
      } else {
        expect(res).toEqual({ point: cursor, kind: null, wallId: null });
      }
    }
  });

  it('N19 toggles and excluded ids', () => {
    const ix = one(C);
    const n1 = { x: -3, y: 0 };
    let res = snap(ix, req(n1, { pixelsPerInch: 2, settings: { ...DEFAULT_SNAP_SETTINGS, endpoints: false } }));
    near(res.point, 0, 2.25);
    expect(res.kind).toBe('face');
    res = snap(ix, req({ x: 62, y: 6 }, { settings: ONLY(['endpoints', 'faces']) }));
    near(res.point, 62, 2.25);
    expect(res.kind).toBe('face');
    const c6 = { x: 30, y: 8 };
    res = snap(ix, req(c6, { settings: ONLY(['endpoints', 'midpoints']) }));
    expect(res.point).toEqual(c6);
    expect(res.kind).toBeNull();
    res = snap(ix, req(n1, { pixelsPerInch: 2, excludeIds: [ID.W1], settings: ALL3 }));
    expect(res.point).toEqual(n1);
    expect(res.kind).toBeNull();
    res = snap(ix, req(n1, { pixelsPerInch: 2, settings: ONLY([]) }));
    expect(res.point).toEqual(n1);
    expect(res.kind).toBeNull();
  });

  it('N20 bad input never throws; candidates come from the index', () => {
    const ix = one(C);
    const zero = { x: 0, y: 0 };
    for (const ppi of [0, -1, NaN]) {
      const res = snap(ix, req(zero, { pixelsPerInch: ppi }));
      expect(res).toEqual({ point: zero, kind: null, wallId: null });
    }
    const bad = { x: NaN, y: 0 };
    expect(snap(ix, req(bad))).toEqual({ point: bad, kind: null, wallId: null });

    const five = { x: 5, y: 5 };
    let res = snap(none(), req(five, { anchor: { x: 5, y: 5 } }));
    expect(res.point).toEqual(five);
    expect(res.kind).toBeNull();

    for (const inc of [0, NaN]) {
      const cursor = { x: 37.3, y: 0 };
      res = snap(none(), req(cursor, { anchor: ORIGIN, settings: ONLY(['increment'], inc) }));
      expect(res.point).toEqual(cursor);
      expect(res.kind).toBeNull();
    }

    res = snap(none(), req({ x: 10.3, y: -4.2 }, { anchor: { x: NaN, y: 0 } }));
    near(res.point, 10.5, -4);
    expect(res.kind).toBe('increment');

    const g = createWallSnapIndex(grid3000());
    res = snap(g, req({ x: 50, y: 3 }));
    near(res.point, 50, 0);
    expect(res.kind).toBe('midpoint');
    expect(res.wallId).toBe('w0000');
    expect(g.spatial.lastQueryExamined()).toBe(1);
  });
});

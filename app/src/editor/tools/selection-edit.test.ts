// EZD-212c U1-U6 (vault/plans/EZD-212c.md section 4, D1-D7; AC-EZD-212-1, -8, -10). Pure functions over the P212b
// fixtures. Expected values: the plan's rows and their cited sources (09k, Q-0630, Q-0640, Q-0641, Q-0746), never the
// code. Every unit length and coordinate compares per component with toBeCloseTo(.., 9).
import { describe, expect, it } from 'vitest';
import type { ModelObject, Point } from '@ezdraft/geometry';
import {
  chipEntryOutcome,
  entryTool,
  fixedPoint,
  handleAt,
  hingeHandle,
  resizeByPoint,
  resizeBySize,
  resizeHandles,
  sizeChipNormal,
  type ResizeHandle,
  type SelectionEntry,
} from './selection-edit';
import { ROOM, objs, uid, withOpening, withWalls } from './test-utils/fixtures';

const pt = (x: number, y: number): Point => ({ x, y });
const toScreen = (p: Point): Point => ({ x: (8 * p.x) / 3, y: (-8 * p.y) / 3 });
const near = (a: Point, x: number, y: number) => {
  expect(a.x).toBeCloseTo(x, 9);
  expect(a.y).toBeCloseTo(y, 9);
};

const PART = withWalls(ROOM, 5, [pt(60, 0), pt(60, 120)], false, 'center');
const DOORF = withOpening(ROOM, 50, 'door', 1, pt(54, 0));
const WIN = withOpening(ROOM, 51, 'window', 3, pt(100, 120));
const FLAG = withOpening(ROOM, 52, 'door', null, pt(54, 0));

type Geo = { start: Point; end: Point; center: Point; hostWallId: string | null };
const dataOf = (o: ModelObject) =>
  o.data as unknown as { geometry: Geo; attributes: { width: number; hand: string | null } };
const changedOf = (r: { changed: ModelObject[] }, id: string): ModelObject => {
  const o = r.changed.find((c) => c.id === id);
  if (o === undefined) throw new Error(`changed has no ${id}`);
  return o;
};
const handle = (list: ResizeHandle[], i: number): ResizeHandle => {
  const h = list[i];
  if (h === undefined) throw new Error(`no handle ${i}`);
  return h;
};

describe('EZD-212c selection edit', () => {
  it('EZD-212c U1 resize handles', () => {
    const e = resizeHandles(objs(ROOM), [uid(2)]);
    expect(e).toHaveLength(2);
    expect(e[0]!.kind).toBe('wall');
    near(e[0]!.at, 146.25, 0);
    near(e[1]!.at, 146.25, 120);
    const p = resizeHandles(objs(PART), [uid(5)]);
    expect(p).toHaveLength(2);
    near(p[0]!.at, 60, 0);
    near(p[1]!.at, 60, 120);
    const d = resizeHandles(objs(DOORF), [uid(50)]);
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ kind: 'opening', id: uid(50), jamb: 'lo' });
    expect(d[1]).toMatchObject({ kind: 'opening', id: uid(50), jamb: 'hi' });
    near(d[0]!.at, 36, -2.25);
    near(d[1]!.at, 72, -2.25);
    const w = resizeHandles(objs(WIN), [uid(51)]);
    expect(w).toHaveLength(2);
    expect(w[0]).toMatchObject({ jamb: 'lo' });
    near(w[0]!.at, 118, 122.25);
    near(w[1]!.at, 82, 122.25);
    const f = resizeHandles(objs(FLAG), [uid(52)]);
    expect(f).toHaveLength(2);
    expect(f[0]).toMatchObject({ jamb: 'lo' });
    near(f[0]!.at, 54, -18);
    near(f[1]!.at, 54, 18);
    expect(resizeHandles(objs(ROOM), [uid(2), uid(3)])).toEqual([]);
    expect(resizeHandles(objs(ROOM), [uid(99)])).toEqual([]);
  });

  it('EZD-212c U2 hit, hinge, fixed point', () => {
    const e = resizeHandles(objs(ROOM), [uid(2)]);
    const base = toScreen(pt(146.25, 120));
    const hit = handleAt(e, { x: base.x + 22, y: base.y }, toScreen);
    expect(hit).toMatchObject({ kind: 'wall', end: 'end' });
    expect(handleAt(e, { x: base.x + 22.01, y: base.y }, toScreen)).toBeNull();

    const tie: ResizeHandle[] = [
      { kind: 'wall', id: 'a', end: 'start', at: pt(0, 0) },
      { kind: 'wall', id: 'b', end: 'start', at: pt(7.5, 0) },
    ];
    expect(handleAt(tie, { x: 10, y: 0 }, toScreen)).toMatchObject({ id: 'a' });

    const hd = hingeHandle(objs(DOORF), uid(50));
    expect(hd).toMatchObject({ kind: 'opening', jamb: 'lo' });
    near(hd!.at, 36, -2.25);
    expect(hingeHandle(objs(WIN), uid(51))).toBeNull();
    const hf = hingeHandle(objs(FLAG), uid(52));
    expect(hf).toMatchObject({ jamb: 'hi' });
    near(hf!.at, 54, 18);

    near(fixedPoint(objs(ROOM), handle(e, 1))!, 144, 0);
    const d = resizeHandles(objs(DOORF), [uid(50)]);
    near(fixedPoint(objs(DOORF), handle(d, 1))!, 36, -2.25);
  });

  it('EZD-212c U3 wall handle by point and size', () => {
    const o = objs(ROOM);
    const end = handle(resizeHandles(o, [uid(2)]), 1);
    const ok = resizeByPoint(o, end, pt(144, 132));
    expect(ok.ok).toBe(true);
    if (!ok.ok) throw new Error('expected ok');
    expect(ok.size).toBeCloseTo(132, 9);
    const e = dataOf(changedOf(ok, uid(2))).geometry;
    near(e.start, 144, 0);
    near(e.end, 144, 132);
    const n = dataOf(changedOf(ok, uid(3))).geometry;
    near(n.start, 144, 132);
    near(n.end, 0, 132);
    const w = dataOf(changedOf(ok, uid(4))).geometry;
    near(w.start, 0, 132);
    near(w.end, 0, 0);

    const zero = resizeByPoint(o, end, pt(144, 0));
    expect(zero).toMatchObject({ ok: false, message: 'office.tools.gap.zero_length' });
    expect(zero.size).toBeCloseTo(0, 9);
    const long = resizeByPoint(o, end, pt(144, 2401));
    expect(long).toMatchObject({ ok: false, message: 'office.tools.gap.too_long' });
    expect(long.size).toBeCloseTo(2401, 9);

    expect(resizeBySize(o, end, 0)).toMatchObject({
      ok: false,
      message: 'office.tools.gap.zero_length',
    });
    expect(resizeBySize(o, end, -5)).toMatchObject({
      ok: false,
      message: 'office.tools.gap.zero_length',
    });
    expect(resizeBySize(o, end, 2401)).toMatchObject({
      ok: false,
      message: 'office.tools.gap.too_long',
    });
    const ghost: ResizeHandle = { kind: 'wall', id: uid(99), end: 'end', at: pt(0, 0) };
    const missing = resizeBySize(o, ghost, 12);
    expect(missing.ok).toBe(false);
    if (missing.ok) throw new Error('expected refusal');
    expect(missing.message).toBe('office.tools.resize.failed');
    expect(Number.isNaN(missing.size)).toBe(true);
  });

  it('EZD-212c U4 opening handle by point and size', () => {
    const o = objs(DOORF);
    const [lo, hi] = resizeHandles(o, [uid(50)]) as [ResizeHandle, ResizeHandle];
    const a = resizeByPoint(o, hi, pt(64, 1));
    expect(a.ok).toBe(true);
    if (!a.ok) throw new Error('expected ok');
    expect(dataOf(changedOf(a, uid(50))).attributes.width).toBeCloseTo(28, 9);
    near(dataOf(changedOf(a, uid(50))).geometry.center, 50, 0);
    const under = resizeByPoint(o, hi, pt(30, 0));
    expect(under).toMatchObject({ ok: false, message: 'office.tools.resize.failed' });
    expect(under.size).toBeCloseTo(-6, 9);
    const over = resizeByPoint(o, hi, pt(150, 0));
    expect(over).toMatchObject({ ok: false, message: 'office.tools.opening.past_corner' });
    expect(over.size).toBeCloseTo(114, 9);
    const b = resizeByPoint(o, lo, pt(24, 0));
    expect(b.ok).toBe(true);
    if (!b.ok) throw new Error('expected ok');
    expect(dataOf(changedOf(b, uid(50))).attributes.width).toBeCloseTo(48, 9);
    near(dataOf(changedOf(b, uid(50))).geometry.center, 48, 0);
    const c = resizeBySize(o, hi, 32);
    expect(c.ok).toBe(true);
    if (!c.ok) throw new Error('expected ok');
    expect(dataOf(changedOf(c, uid(50))).attributes.width).toBeCloseTo(32, 9);
    near(dataOf(changedOf(c, uid(50))).geometry.center, 52, 0);
    const zero = resizeBySize(o, hi, 0);
    expect(zero).toMatchObject({ ok: false, message: 'office.tools.resize.failed' });
    expect(zero.size).toBeCloseTo(0, 9);

    const wo = objs(WIN);
    const wh = resizeHandles(wo, [uid(51)]);
    const win = resizeBySize(wo, handle(wh, 1), 30);
    expect(win.ok).toBe(true);
    if (!win.ok) throw new Error('expected ok');
    expect(dataOf(changedOf(win, uid(51))).attributes.width).toBeCloseTo(30, 9);
    near(dataOf(changedOf(win, uid(51))).geometry.center, 103, 120);

    const fo = objs(FLAG);
    const [flo, fhi] = resizeHandles(fo, [uid(52)]) as [ResizeHandle, ResizeHandle];
    const f1 = resizeBySize(fo, fhi, 30);
    expect(f1.ok).toBe(true);
    if (!f1.ok) throw new Error('expected ok');
    const fd = dataOf(changedOf(f1, uid(52)));
    expect(fd.attributes.width).toBeCloseTo(30, 9);
    near(fd.geometry.center, 54, -3);
    expect(fd.geometry.hostWallId).toBeNull();
    const f2 = resizeByPoint(fo, flo, pt(54, -24));
    expect(f2.ok).toBe(true);
    if (!f2.ok) throw new Error('expected ok');
    const fd2 = dataOf(changedOf(f2, uid(52)));
    expect(fd2.attributes.width).toBeCloseTo(42, 9);
    near(fd2.geometry.center, 54, -3);
  });

  it('EZD-212c U5 entry tools and chip outcomes', () => {
    const chipWallL: SelectionEntry = { kind: 'chip', id: uid(5), objectKind: 'wall', side: 'left' };
    const chipDoorR: SelectionEntry = { kind: 'chip', id: uid(50), objectKind: 'door', side: 'right' };
    const handleWall: SelectionEntry = { kind: 'handle', id: uid(2), objectKind: 'wall' };
    const handleWin: SelectionEntry = { kind: 'handle', id: uid(51), objectKind: 'window' };
    const t = [chipWallL, chipDoorR, handleWall, handleWin].map(entryTool);
    expect(t.map((x) => x.id)).toEqual([
      'chip-wall-left',
      'chip-door-right',
      'handle-wall',
      'handle-window',
    ]);
    expect(t.map((x) => x.fields[0].id)).toEqual(['distance', 'offsetRight', 'length', 'width']);
    expect(t.map((x) => (x.fields[0] as { lengthKind: string }).lengthKind)).toEqual([
      'other',
      'other',
      'wall_room',
      'positive',
    ]);

    const w = chipEntryOutcome(objs(PART), chipWallL, 60);
    expect(w).not.toBeNull();
    if (w === null || !w.ok) throw new Error('expected ok');
    const pg = dataOf(changedOf(w, uid(5))).geometry;
    near(pg.start, 62.25, 0);
    near(pg.end, 62.25, 120);
    expect(w.changed.map((c) => c.id)).toEqual([uid(5)]);

    const doorL: SelectionEntry = { kind: 'chip', id: uid(50), objectKind: 'door', side: 'left' };
    const d = chipEntryOutcome(objs(DOORF), doorL, 24);
    if (d === null || !d.ok) throw new Error('expected ok');
    near(dataOf(changedOf(d, uid(50))).geometry.center, 42, 0);
    expect(chipEntryOutcome(objs(DOORF), doorL, 109)).toEqual({
      ok: false,
      message: 'office.tools.opening.past_corner',
    });
    expect(chipEntryOutcome(objs(DOORF), doorL, null)).toBeNull();
    expect(chipEntryOutcome(objs(ROOM), handleWall, 5)).toBeNull();
  });

  it('EZD-212c U6 size chip normal', () => {
    const o = objs(DOORF);
    const left = sizeChipNormal(o, uid(50));
    near(left!, 0, -1);
    const right = o.map((x) =>
      x.id === uid(50)
        ? ({
            ...x,
            data: {
              ...x.data,
              attributes: { ...(x.data as { attributes: object }).attributes, swing: 'right' },
            },
          } as unknown as ModelObject)
        : x,
    );
    near(sizeChipNormal(right, uid(50))!, 0, 1);
    near(sizeChipNormal(objs(WIN), uid(51))!, 0, 1);
    near(sizeChipNormal(objs(FLAG), uid(52))!, 1, 0);
    expect(sizeChipNormal(objs(ROOM), uid(2))).toBeNull();
  });
});

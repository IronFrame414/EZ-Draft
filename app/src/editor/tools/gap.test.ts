// EZD-210a G1-G3, P1-P4, K1 (vault/plans/EZD-210a.md sections 1 Decided "Gap box", "Gap size text", "Pick mode",
// "pickWall", "Refusal keys", "keepGap", 3 C22-C31, 4). Sources: 09j Closure, Absorbing, Keep out of square;
// 00e Pick mode; S02 Esc, Decisions; Q-0562; Q-0568; Q-0569 (b), (c); Q-0570; AC-EZD-210-8, -9; ticket Done-when.
import {
  CURRENT_SCHEMA_VERSION,
  findClosures,
  roomAreaSqFt,
  wallLength,
  type GapReport,
  type Point,
} from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import type { Objects } from '../model/patches';
import {
  absorbRefusalKey,
  gapBoxes,
  gapSizeText,
  keepGap,
  pickWall,
  reducePick,
  type GapBox,
} from './index';
import {
  F1,
  WHEN,
  WHO,
  applyChanges,
  baseObjects,
  drawWithWall,
  idSeq,
  roomValue,
  roomsOf,
  typedEnws,
  uid,
  wallsOf,
  withWalls,
} from './test-utils/fixtures';

const p = (x: number, y: number): Point => ({ x, y });
const EDIT = { canEdit: true, drawingWallIds: [] as string[] };

// The 12', 10', 12', 9' 11 1/2" chain, finished with Enter.
function g1Objects(): Map<string, ObjectValue> {
  return drawWithWall(baseObjects(), [...typedEnws([144, 120, 144, 119.5]), { type: 'enter' }], 1)
    .objects;
}

function onlyBox(objects: Objects): GapBox {
  const boxes = gapBoxes(objects, F1, EDIT);
  expect(boxes).toHaveLength(1);
  return boxes[0]!;
}

const open = (pts: Point[]) => withWalls(baseObjects(), 1, pts, false);

describe('EZD-210a gap box, pick, absorb and keep', () => {
  it('EZD-210a G1 the gap box of a 1/2" miss', () => {
    const objects = g1Objects();
    const boxes = gapBoxes(objects, F1, EDIT);
    expect(boxes).toHaveLength(1);
    const box = boxes[0]!;
    expect(box.wallIds).toEqual([uid(1), uid(2), uid(3), uid(4)]);
    expect(box.gap.x).toBeCloseTo(0, 9);
    expect(box.gap.y).toBeCloseTo(-0.5, 9);
    expect(box.sizeIn).toBeCloseTo(0.5, 9);
    expect(box.displayIn).toBe(0.5);
    expect(box.sizeText).toBe('1/2"');
    expect(box.at.x).toBeCloseTo(0, 9);
    expect(box.at.y).toBeCloseTo(0.25, 9);
    expect(box.actions).toEqual(['absorb', 'keep']);
    expect(box.note).toBeNull();
    expect(roomsOf(objects)).toHaveLength(0);
    const view = gapBoxes(objects, F1, { canEdit: false, drawingWallIds: [] });
    expect(view).toHaveLength(1);
    expect(view[0]!.actions).toEqual([]);
    expect(view[0]!.note).toBeNull();
    expect(view[0]!.sizeText).toBe('1/2"');
    expect(gapBoxes(objects, F1, { canEdit: true, drawingWallIds: [uid(4)] })).toEqual([]);
    const rebuilt = new Map<string, ObjectValue>(JSON.parse(JSON.stringify([...objects])));
    expect(gapBoxes(rebuilt, F1, EDIT)).toEqual(boxes);
  });

  it('EZD-210a G2 gap rows, one input per row', () => {
    const rect = (last: Point) => open([p(0, 0), p(144, 0), p(144, 120), p(0, 120), last]);
    const row = (objects: Objects, sizeText: string, actions: string[], note: string | null) => {
      const box = onlyBox(objects);
      expect({ sizeText: box.sizeText, actions: box.actions, note: box.note }).toEqual({
        sizeText,
        actions,
        note,
      });
    };
    row(rect(p(0, 0.0625)), '1/16"', ['absorb', 'keep'], null); // row 3
    row(rect(p(0, 12)), '12"', ['absorb', 'keep'], null); // row 4
    expect(gapBoxes(rect(p(0, 12.0625)), F1, EDIT)).toEqual([]); // row 5
    row(rect(p(0, 0.02)), '1/16"', ['absorb', 'keep'], null); // row 8
    row(
      open([p(0, 0), p(144, 0), p(144, 120), p(0.5, 120), p(0.5, 0.5)]),
      '11/16"',
      ['keep'],
      'office.tools.gap.fix_later',
    ); // row 6
    expect(gapBoxes(open([p(0, 0), p(6, 0), p(6, 6)]), F1, EDIT)).toEqual([]); // row 9
    expect(gapBoxes(baseObjects(), F1, EDIT)).toEqual([]);
    expect(gapSizeText(11.9375)).toBe('11 15/16"');
  });

  it('EZD-210a G3 a kept gap is resolved, a changed one is not', () => {
    const walls = open([p(0, 0), p(144, 0), p(144, 120), p(0, 120), p(0, 0.5)]);
    const report = findClosures(wallsOf(walls), F1).find((r): r is GapReport => r.kind === 'gap');
    if (report === undefined) throw new Error('the row-2 walls give no gap report');
    const kept = (gap: Point) =>
      new Map(walls).set(
        uid(10),
        roomValue(report.boundary, 'Room 1', { who: WHO, when: WHEN, gap }),
      );
    expect(gapBoxes(kept(p(0, -0.5)), F1, EDIT)).toEqual([]);
    expect(gapBoxes(kept(p(0, -0.25)), F1, EDIT)).toHaveLength(1);
  });

  it('EZD-210a P1 pick mode and Esc', () => {
    const started = reducePick(null, { type: 'start', gapWallIds: [uid(1)] });
    expect(started).toEqual({ state: { gapWallIds: [uid(1)] }, handled: true });
    expect(reducePick(started.state, { type: 'escape' })).toEqual({ state: null, handled: true });
    expect(reducePick(null, { type: 'escape' })).toEqual({ state: null, handled: false });
    expect(reducePick(started.state, { type: 'done' })).toEqual({ state: null, handled: true });
  });

  it('EZD-210a P2 absorb by the 9\' 11 1/2" wall (done when: 120 SF)', () => {
    const objects = g1Objects();
    const box = onlyBox(objects);
    const r = pickWall(objects, F1, box.wallIds, uid(4), idSeq(50));
    if (!r.ok) throw new Error(`pickWall refused: ${r.messageKey}`);
    const after = applyChanges(objects, r.changes);
    const rooms = roomsOf(after);
    expect(rooms).toHaveLength(1);
    expect(roomAreaSqFt(rooms[0]!.data.geometry.boundary)).toBe(120);
    const w4 = wallsOf(after).find((w) => w.id === uid(4));
    expect(w4).toBeDefined();
    expect(wallLength(w4!.data.geometry)).toBeCloseTo(120, 9);
    expect(gapBoxes(after, F1, EDIT)).toEqual([]);
  });

  it("EZD-210a P3 refused picks (done when: a 12' wall is refused)", () => {
    const g1 = g1Objects();
    const ids = onlyBox(g1).wallIds;
    const refusal = (objects: Objects, gapIds: readonly string[], wallId: string) => {
      const r = pickWall(objects, F1, gapIds, wallId, idSeq(50));
      return r.ok ? 'ok' : r.messageKey;
    };
    expect(refusal(g1, ids, uid(1))).toBe('office.tools.gap.across');
    const withRect = withWalls(g1, 20, [p(300, 0), p(444, 0), p(444, 120), p(300, 120)], true);
    expect(refusal(withRect, ids, uid(20))).toBe('office.tools.gap.not_in_room');
    expect(refusal(g1, ids, '00000000-0000-4000-8000-0000000000ff')).toBe(
      'office.tools.gap.not_in_room',
    );
    expect(refusal(g1, [], uid(4))).toBe('office.tools.gap.gone');
    const short = open([p(0, 0), p(144, 0), p(144, 12), p(0, 12)]);
    expect(refusal(short, onlyBox(short).wallIds, uid(2))).toBe('office.tools.gap.zero_length');
    const long = open([p(0, 0), p(2400, 0), p(2400, 120), p(1200, 120), p(-0.5, 120), p(-0.5, 0)]);
    expect(refusal(long, onlyBox(long).wallIds, uid(1))).toBe('office.tools.gap.too_long');
    expect(
      (
        [
          'no_gap',
          'wall_not_found',
          'not_in_chain',
          'across_gap',
          'zero_length',
          'too_long',
          'join_lost',
        ] as const
      ).map(absorbRefusalKey),
    ).toEqual([
      'office.tools.gap.gone',
      'office.tools.gap.not_in_room',
      'office.tools.gap.not_in_room',
      'office.tools.gap.across',
      'office.tools.gap.zero_length',
      'office.tools.gap.too_long',
      'office.tools.gap.join_lost',
    ]);
  });

  it('EZD-210a P4 absorb closes a clockwise chain with thickness outside', () => {
    const objects = open([p(0, 0), p(0, 120), p(144, 120), p(144, 0), p(0.5, 0)]);
    const r = pickWall(objects, F1, onlyBox(objects).wallIds, uid(4), idSeq(50));
    if (!r.ok) throw new Error(`pickWall refused: ${r.messageKey}`);
    const after = applyChanges(objects, r.changes);
    expect(wallsOf(after).map((w) => w.data.attributes.thicknessSide)).toEqual([
      'left',
      'left',
      'left',
      'left',
    ]);
    const rooms = roomsOf(after);
    expect(rooms).toHaveLength(1);
    expect(roomAreaSqFt(rooms[0]!.data.geometry.boundary)).toBe(120);
  });

  it('EZD-210a K1 keep out of square', () => {
    const objects = g1Objects();
    const ids = onlyBox(objects).wallIds;
    const r = keepGap(objects, F1, ids, WHO, WHEN, idSeq(60));
    if (!r.ok) throw new Error(`keepGap refused: ${r.messageKey}`);
    expect(r.changes).toHaveLength(1);
    const change = r.changes[0]!;
    expect(change.id).toBe(uid(60));
    expect(change.value?.type).toBe('room');
    expect(change.value?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const data = change.value?.data as {
      geometry: { boundary: Point[] };
      closureOverride: { who: string; when: string; gap: Point } | null;
    };
    expect(data.closureOverride).not.toBeNull();
    expect(data.closureOverride!.who).toBe(WHO);
    expect(data.closureOverride!.when).toBe(WHEN);
    expect(data.closureOverride!.gap.x).toBeCloseTo(0, 9);
    expect(data.closureOverride!.gap.y).toBeCloseTo(-0.5, 9);
    expect(roomAreaSqFt(data.geometry.boundary)).toBe(120);
    expect(gapBoxes(applyChanges(objects, r.changes), F1, EDIT)).toEqual([]);
    expect(keepGap(objects, F1, [], WHO, WHEN, idSeq(60))).toEqual({
      ok: false,
      messageKey: 'office.tools.gap.gone',
    });
    expect(keepGap(objects, F1, ids, 'not-a-uuid', WHEN, idSeq(60))).toEqual({
      ok: false,
      messageKey: 'office.tools.gap.keep_failed',
    });
  });
});

// EZD-357 · a typed chain that closes at exactly 12" shows its gap box (vault/plans/EZD-357.md sections 3-4;
// AC-EZD-357-1, AC-EZD-357-2). Sources: 09j Closure rows 4-5 and Typed lengths row 6; Q-0562; Q-0568; 205b Decided "Gap".
describe('EZD-357 typed chain at the 12" limit', () => {
  it("EZD-357 done when: the typed 12', 10', 12', 9' chain shows one 12\" gap box", () => {
    const objects = drawWithWall(
      baseObjects(),
      [...typedEnws([144, 120, 144, 108]), { type: 'enter' }],
      1,
    ).objects;
    const boxes = gapBoxes(objects, F1, EDIT);
    expect(boxes).toHaveLength(1);
    const box = boxes[0]!;
    expect(box.wallIds).toEqual([uid(1), uid(2), uid(3), uid(4)]);
    expect(box.sizeIn).toBeCloseTo(12, 9);
    expect(box.gap.x).toBeCloseTo(0, 9);
    expect(box.gap.y).toBeCloseTo(-12, 9);
    expect(box.displayIn).toBe(12);
    expect(box.sizeText).toBe('12"');
    expect(box.actions).toEqual(['absorb', 'keep']);
    expect(box.note).toBeNull();
    expect(roomsOf(objects)).toHaveLength(0);
  });

  it("EZD-357 done when: the typed 12', 10', 12', 8' 11 15/16\" chain shows no gap box", () => {
    const objects = drawWithWall(
      baseObjects(),
      [...typedEnws([144, 120, 144, 107.9375]), { type: 'enter' }],
      1,
    ).objects;
    expect(gapBoxes(objects, F1, EDIT)).toEqual([]);
    expect(roomsOf(objects)).toHaveLength(0);
  });
});

// EZD-294 T5 (vault/plans/EZD-294.md section 4; Decided "gap.ts"; 09j Absorbing row 1; AC-EZD-294-1).
describe('EZD-294 object numbers in gap absorb', () => {
  it('EZD-294 T5 absorbing a gap keeps every wall number', () => {
    const gapPoints = [p(0, 0), p(144, 0), p(144, 120), p(0, 120), p(0, 0.5)];
    const base = withWalls(baseObjects(), 1, gapPoints, false);
    const objects = new Map<string, ObjectValue>(base);
    [1, 2, 3, 4].forEach((k) => {
      const v = base.get(uid(k))!;
      const attrs = (v.data as { attributes: Record<string, unknown> }).attributes;
      objects.set(uid(k), { ...v, data: { ...v.data, attributes: { ...attrs, number: k } } });
    });
    const r = pickWall(objects, F1, onlyBox(objects).wallIds, uid(4), idSeq(50));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const walls = r.changes.filter((c) => c.value?.type === 'wall');
    expect(walls.length).toBeGreaterThan(0);
    for (const c of walls) {
      const k = parseInt(c.id.slice(-12), 16);
      const attrs = (c.value!.data as { attributes: Record<string, unknown> }).attributes;
      expect(attrs.number).toBe(k);
    }
  });
});

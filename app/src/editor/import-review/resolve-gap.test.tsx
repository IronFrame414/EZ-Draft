// EZD-311 (AC-EZD-311-1 "Finish stays blocked until the gap is resolved"; S02 Controls Pick the wall that absorbs it,
// Keep the room out of square; Validation "Finish import blocked while any To check item is unresolved or any room
// has an unresolved gap"; Decisions "Finish import requires every item to be resolved ... and every room gap
// resolved", "Pick the wall that absorbs it accepts any wall of the room that does not close ... Walls of other rooms
// cannot be picked"; Q-0630; Plan editor wording office.tools.gap.*).
// Fixture: the 12' x 10' room of ImportReview.conflicts.test.tsx. Corners SW (0,0), SE (144,0), NE (144,120),
// NW (0,120); the walk from SW runs south wall east (+x), east wall north (+y), north wall west (-x), west wall south
// (-y). The east wall scans 118 in; typed 119 in it is 1 in longer, so the walk ends 1 in north of SW: a 1" gap,
// vector (0, 1). Worked by hand:
// - West wall (scan 120, walk direction (0,-1)): the gap's part along it is -1, so it becomes 120 + 1 = 121 in and
//   the walk closes. Its start (0,0) stays and its end moves along it to (0,121).
// - East wall: 119 - 1 = 118 in, back to the scan.
// - North and south walls run across the gap (all of its 1 in is across them, over the 1/2" tolerance): refused.
// - North typed 145 in as well adds 1 in along (-1,0): vector (-1, 1), parts both ways, so no wall absorbs it.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { elements, textOf } from '../../../test-harness/projects-markup';
import type { Decisions, ReviewItem } from '../../lib/imports/review';
import { applyFix, finishItems, parseFix, withFix, type Fixes } from '../../lib/imports/review-fix';
import {
  absorbGap,
  finishBlocked,
  gapForSelection,
  itemConflicts,
  keepFix,
  openGaps,
} from '../../lib/imports/review-conflicts';
import { ReadyBody, reviewGapBox, type ImportReviewData } from './ImportReview';
import { ResolveGap } from '../inspector/ResolveGap';

const render = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      {ui}
    </MessagesProvider>,
  );

const w = (
  id: string,
  n: number,
  side: 'north' | 'east' | 'south' | 'west',
  s: [number, number],
  e: [number, number],
): ReviewItem => ({
  id,
  type: 'wall',
  number: n,
  side,
  confidence: id === 'w2' ? 70 : 95,
  geometry: { start: { x: s[0], y: s[1] }, end: { x: e[0], y: e[1] } },
  thickness: 4.5,
});

const ROOM: ReviewItem = {
  id: 'r1',
  type: 'room',
  number: 1,
  confidence: 90,
  boundary: [
    { x: 0, y: 0 },
    { x: 144, y: 0 },
    { x: 144, y: 120 },
    { x: 0, y: 120 },
  ],
  closed: true,
  areaSqIn: 17280,
};

const ITEMS: ReviewItem[] = [
  w('w1', 1, 'south', [144, 0], [0, 0]),
  w('w2', 2, 'east', [144, 118], [144, 0]),
  w('w3', 3, 'north', [0, 120], [144, 120]),
  w('w4', 4, 'west', [0, 0], [0, 120]),
  ROOM,
];

// A wall of no room (a partition 10' east of the room).
const LOOSE = w('w9', 9, 'east', [264, 0], [264, 120]);

const TOL = 0.5;
const TYPED_EAST = { geometry: { start: { x: 144, y: 118 }, end: { x: 144, y: -1 } }, typed: 119 };
const ALL: Decisions = Object.fromEntries(ITEMS.map((i) => [i.id, 'accepted' as const]));
const TYPED: Fixes = { w2: TYPED_EAST };

const absorbed = (wallId: string, items = ITEMS) => {
  const r = absorbGap(items, ALL, TYPED, TOL, 'r1', wallId);
  if (!r.ok) throw new Error(r.reason);
  return r.fix;
};

describe('EZD-311 Finish stays blocked until the gap is resolved (AC-EZD-311-1)', () => {
  it('every item resolved but the room open: Finish is blocked by the 1" gap', () => {
    expect(finishBlocked(ITEMS, ALL, TYPED, TOL)).toBe(true);
    const gaps = openGaps(ITEMS, ALL, TYPED, TOL);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].roomId).toBe('r1');
    expect(gaps[0].inches).toBeCloseTo(1, 9);
    expect(gaps[0].vector.x).toBeCloseTo(0, 9);
    expect(gaps[0].vector.y).toBeCloseTo(1, 9);
    expect(gaps[0].wallIds).toEqual(['w1', 'w2', 'w3', 'w4']);
    expect(gaps[0].absorbable).toBe(true);
  });

  it('nothing typed and every item resolved: Finish is not blocked; one item unresolved blocks it', () => {
    expect(finishBlocked(ITEMS, ALL, {}, TOL)).toBe(false);
    const { w4: _w4, ...rest } = ALL;
    expect(finishBlocked(ITEMS, rest, {}, TOL)).toBe(true);
  });

  it('Pick the wall that absorbs it: the west wall becomes 121 in and Finish is no longer blocked', () => {
    const fix = absorbed('w4');
    expect(fix.typed).toBeCloseTo(121, 9);
    expect(fix.geometry.start).toEqual({ x: 0, y: 0 });
    expect(fix.geometry.end.x).toBeCloseTo(0, 9);
    expect(fix.geometry.end.y).toBeCloseTo(121, 9);
    const after = withFix({ decisions: ALL, fixes: TYPED }, 'w4', fix);
    expect(openGaps(ITEMS, after.decisions, after.fixes, TOL)).toEqual([]);
    expect(finishBlocked(ITEMS, after.decisions, after.fixes, TOL)).toBe(false);
  });

  it('the typed wall itself can absorb it: back to its 118 in scan', () => {
    expect(absorbed('w2').typed).toBeCloseTo(118, 9);
  });

  it('a wall across the gap, a wall of no room, and a room with no gap are refused', () => {
    expect(absorbGap(ITEMS, ALL, TYPED, TOL, 'r1', 'w3')).toEqual({ ok: false, reason: 'across' });
    expect(absorbGap(ITEMS, ALL, TYPED, TOL, 'r1', 'w1')).toEqual({ ok: false, reason: 'across' });
    const withLoose = [...ITEMS, LOOSE];
    expect(absorbGap(withLoose, { ...ALL, w9: 'accepted' }, TYPED, TOL, 'r1', 'w9')).toEqual({
      ok: false,
      reason: 'not_in_room',
    });
    expect(absorbGap(ITEMS, ALL, {}, TOL, 'r1', 'w4')).toEqual({ ok: false, reason: 'no_gap' });
  });

  it('a gap with parts both ways offers Keep only, with the Move a wall note', () => {
    const fixes: Fixes = {
      ...TYPED,
      w3: { geometry: { start: { x: 0, y: 120 }, end: { x: 145, y: 120 } }, typed: 145 },
    };
    const [gap] = openGaps(ITEMS, ALL, fixes, TOL);
    expect(gap.vector.x).toBeCloseTo(-1, 9);
    expect(gap.vector.y).toBeCloseTo(1, 9);
    expect(gap.absorbable).toBe(false);
    expect(reviewGapBox(gap).actions).toEqual(['keep']);
    expect(reviewGapBox(gap).note).toBe('office.tools.gap.use_move');
    for (const id of ['w1', 'w2', 'w3', 'w4']) {
      expect(absorbGap(ITEMS, ALL, fixes, TOL, 'r1', id)).toEqual({ ok: false, reason: 'across' });
    }
    expect(finishBlocked(ITEMS, ALL, fixes, TOL)).toBe(true);
  });

  it('Keep the room out of square resolves the gap, is saved with the room, and goes with it to Finish', () => {
    const keep = keepFix(ITEMS, ALL, TYPED, TOL, 'r1');
    expect(keep).not.toBeNull();
    expect(keep?.boundary).toEqual((ROOM as Extract<ReviewItem, { type: 'room' }>).boundary);
    expect(keep?.keep?.gap.x).toBeCloseTo(0, 9);
    expect(keep?.keep?.gap.y).toBeCloseTo(1, 9);
    const fixes: Fixes = { ...TYPED, r1: keep! };
    expect(openGaps(ITEMS, ALL, fixes, TOL)).toEqual([]);
    expect(finishBlocked(ITEMS, ALL, fixes, TOL)).toBe(false);
    // The typed wall no longer lists the kept gap; its fix saves and reads back with the kept gap.
    expect(itemConflicts(ITEMS, fixes, 'w2', TOL).filter((c) => c.kind === 'gap')).toEqual([]);
    expect(parseFix(ROOM, JSON.parse(JSON.stringify(keep)))).toEqual(keep);
    const room = finishItems(ITEMS, ALL, fixes).find((i) => i.id === 'r1');
    expect(room && room.type === 'room' ? room.keptGap : null).toEqual(keep?.keep?.gap);
    // Keep leaves the room's decision as it was.
    const { r1: _r1, ...noRoom } = ALL;
    expect(finishBlocked(ITEMS, noRoom, fixes, TOL)).toBe(true);
  });

  it('a kept gap that changes afterwards (east retyped 10\' 0") blocks Finish again', () => {
    const keep = keepFix(ITEMS, ALL, TYPED, TOL, 'r1')!;
    const fixes: Fixes = {
      r1: keep,
      w2: { geometry: { start: { x: 144, y: 118 }, end: { x: 144, y: -2 } }, typed: 120 },
    };
    const gaps = openGaps(ITEMS, ALL, fixes, TOL);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].inches).toBeCloseTo(2, 9);
    expect(finishBlocked(ITEMS, ALL, fixes, TOL)).toBe(true);
  });

  it('a deleted room does not block Finish with its gap', () => {
    expect(finishBlocked(ITEMS, { ...ALL, r1: 'rejected' }, TYPED, TOL)).toBe(false);
  });

  it('dragging a kept room corner keeps the kept gap', () => {
    const keep = keepFix(ITEMS, ALL, TYPED, TOL, 'r1')!;
    const standing = applyFix(ROOM, keep);
    expect(standing.type === 'room' ? standing.keptGap : null).toEqual(keep.keep?.gap);
  });

  it('the room and each of its walls show the gap; a wall of no room does not (Q-0630)', () => {
    const gaps = openGaps(ITEMS, ALL, TYPED, TOL);
    for (const id of ['r1', 'w1', 'w2', 'w3', 'w4']) expect(gapForSelection(gaps, id)?.roomId).toBe('r1');
    expect(gapForSelection(gaps, 'w9')).toBeNull();
    expect(gapForSelection(gaps, null)).toBeNull();
  });
});

const review = (over: Partial<ImportReviewData> = {}): ImportReviewData => ({
  jobId: '00000000-0000-4000-8000-0000000000aa',
  projectId: '00000000-0000-4000-8000-0000000000bb',
  projectName: 'Family room',
  status: 'ready',
  files: [{ name: 'family-room.dxf', kind: 'polycam_dxf' }],
  failedFile: null,
  items: ITEMS,
  meshUrl: null,
  cutoff: 80,
  decisions: ALL,
  fixes: TYPED,
  // One by one starts on the first item, the south wall, a wall of the open room.
  mode: 'one_by_one',
  ...over,
});

describe('EZD-311 Resolve the gap in the inspector (board S02 wording)', () => {
  it('a wall of the open room shows Resolve the gap with the size and both actions', () => {
    const html = render(<ReadyBody review={review()} />);
    const section = elements(html, 'inspector-gap');
    expect(section).toHaveLength(1);
    expect(textOf(elements(html, 'gap-title')[0].inner)).toBe('Resolve the gap');
    expect(textOf(elements(html, 'gap-size')[0].inner)).toContain('1&quot; gap');
    expect(textOf(elements(html, 'gap-pick')[0].inner)).toContain('Pick the wall that absorbs it');
    expect(textOf(elements(html, 'gap-keep')[0].inner)).toContain('Keep the room out of square');
    expect(elements(html, 'review-gap')).toHaveLength(1);
  });

  it('a kept room shows no gap marker and no Resolve the gap', () => {
    const keep = keepFix(ITEMS, ALL, TYPED, TOL, 'r1')!;
    const html = render(<ReadyBody review={review({ fixes: { ...TYPED, r1: keep } })} />);
    expect(elements(html, 'inspector-gap')).toHaveLength(0);
    expect(elements(html, 'review-gap')).toHaveLength(0);
  });

  it('a room that closes shows no Resolve the gap', () => {
    const html = render(<ReadyBody review={review({ fixes: {} })} />);
    expect(elements(html, 'inspector-gap')).toHaveLength(0);
  });
});

describe('EZD-311 pick mode on a tablet (Q-0630: every action works without a keyboard)', () => {
  const box = () => reviewGapBox(openGaps(ITEMS, ALL, TYPED, TOL)[0]);
  const noop = () => {};
  it('a coarse pointer shows the review hint naming Back, and Back is offered', () => {
    const html = render(
      <ResolveGap
        box={box()}
        picking
        alert={null}
        coarse
        onPick={noop}
        onKeep={noop}
        pickHint="office.review.gap_pick_hint_touch"
        onBack={noop}
      />,
    );
    expect(textOf(elements(html, 'gap-hint')[0].inner)).toBe(
      'Tap a wall of this room, or tap Back to go back',
    );
    expect(textOf(elements(html, 'gap-back')[0].inner)).toContain('Back');
    expect(elements(html, 'gap-pick')).toHaveLength(0);
  });
  it('the Plan editor (no review props) keeps its own hint and has no Back', () => {
    const html = render(
      <ResolveGap box={box()} picking alert={null} coarse onPick={noop} onKeep={noop} />,
    );
    expect(textOf(elements(html, 'gap-hint')[0].inner)).toBe(
      'Tap a wall of this room, or tap Select to go back',
    );
    expect(elements(html, 'gap-back')).toHaveLength(0);
  });
});

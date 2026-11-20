// EZD-309 (AC-EZD-309-1 "A fixed wall is written in its fixed position on Finish"; S02 Controls Fix selected, Drag
// endpoint / edge, Delete, Ctrl/Cmd+Z; Decisions "resolved (accepted, fixed or deleted)"). Items: the room-12x10
// fixture's detected walls, door and room (fixtures/synthetic/room-12x10.dxf.expected.json `semantic`, as in
// server/imports/review.db.test.ts). Expected values are worked by hand from those coordinates.
import { describe, expect, it } from 'vitest';
import type { ReviewItem, ReviewOpening, ReviewRoom, ReviewWall } from './review';
import {
  applyFix,
  changedIds,
  changeFor,
  commit,
  dragHandle,
  finishItems,
  historyOf,
  itemHandles,
  liveLength,
  parseFix,
  redo,
  snapHandle,
  undo,
  withDecision,
  withFix,
  type ReviewState,
} from './review-fix';

const wall = (
  n: number,
  side: ReviewWall['side'],
  sx: number,
  sy: number,
  ex: number,
  ey: number,
): ReviewWall => ({
  id: `w${n}`,
  type: 'wall',
  number: n,
  side,
  confidence: 95,
  geometry: { start: { x: sx, y: sy }, end: { x: ex, y: ey } },
  thickness: 4.5,
});
const W1 = wall(1, 'south', 144, 0, 0, 0);
const W2 = wall(2, 'east', 144, 120, 144, 0);
const W3 = wall(3, 'north', 0, 120, 144, 120);
const W4 = wall(4, 'west', 0, 0, 0, 120);
const DOOR: ReviewOpening = {
  id: 'o1',
  type: 'opening',
  kind: 'door',
  number: 1,
  confidence: 90,
  hostWallId: 'w1',
  width: 36,
  center: { x: 30, y: 0 },
};
const ROOM: ReviewRoom = {
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
const ITEMS: ReviewItem[] = [W1, W2, W3, W4, DOOR, ROOM];
const EMPTY: ReviewState = { decisions: {}, fixes: {} };

describe('EZD-309 Finish writes fixed items at their fixed position', () => {
  it('AC-EZD-309-1: a fixed wall comes out of finishItems at its fixed position', () => {
    // Drag the north wall's east end from (144, 120) down to (144, 118).
    const fix = dragHandle(W3, ITEMS, 'end', { x: 144, y: 118 });
    const state = withFix(EMPTY, 'w3', fix);
    expect(state.decisions.w3).toBe('accepted');
    const out = finishItems(ITEMS, state.decisions, state.fixes);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'w3',
      geometry: { start: { x: 0, y: 120 }, end: { x: 144, y: 118 } },
    });
  });

  it('leaves out rejected and unresolved items and keeps accepted ones in detection order', () => {
    let s = withDecision(EMPTY, 'w2', 'accepted');
    s = withDecision(s, 'w1', 'rejected');
    s = withFix(s, 'o1', { center: { x: 27, y: 0 }, width: 42 });
    const out = finishItems(ITEMS, s.decisions, s.fixes);
    expect(out.map((i) => i.id)).toEqual(['w2', 'o1']);
    expect(out[0]).toEqual(W2);
    expect(out[1]).toMatchObject({ center: { x: 27, y: 0 }, width: 42 });
  });

  it('a deleted item stays out even when it was fixed first', () => {
    let s = withFix(EMPTY, 'w3', {
      geometry: { start: { x: 0, y: 120 }, end: { x: 144, y: 118 } },
    });
    s = withDecision(s, 'w3', 'rejected');
    expect(finishItems(ITEMS, s.decisions, s.fixes)).toEqual([]);
  });
});

describe('EZD-309 handles and drags', () => {
  it('a wall has its two ends as handles; dragging the start keeps the end', () => {
    expect(itemHandles(W1, ITEMS).map((h) => h.point)).toEqual([
      { x: 144, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect(dragHandle(W1, ITEMS, 'start', { x: 150, y: 0 })).toEqual({
      geometry: { start: { x: 150, y: 0 }, end: { x: 0, y: 0 } },
    });
  });

  it('an opening edge moves along its host wall and the other edge stays', () => {
    // Host w1 runs west (axis (-1, 0)); centre 30, width 36: edges at x 48 and x 12.
    expect(itemHandles(DOOR, ITEMS).map((h) => h.point)).toEqual([
      { x: 48, y: 0 },
      { x: 12, y: 0 },
    ]);
    // Edge at x 12 dragged to (6, 3): projected to x 6 on the wall; width 48 - 6 = 42, centre 27.
    expect(dragHandle(DOOR, ITEMS, 'edge1', { x: 6, y: 3 })).toEqual({
      center: { x: 27, y: 0 },
      width: 42,
    });
    // Dragged past the other edge: held at 1 in wide.
    expect(dragHandle(DOOR, ITEMS, 'edge1', { x: 60, y: 0 })).toEqual({
      center: { x: 47.5, y: 0 },
      width: 1,
    });
  });

  it('a room corner moves and the area follows', () => {
    const fix = dragHandle(ROOM, ITEMS, 'corner2', { x: 144, y: 132 });
    const fixed = applyFix(ROOM, fix);
    expect(fixed.type === 'room' && fixed.boundary[2]).toEqual({ x: 144, y: 132 });
    // Trapezoid 144 wide, sides 120 and 132: 144 x (120 + 132) / 2 = 18,144 sq in.
    expect(fixed.type === 'room' && fixed.areaSqIn).toBe(18144);
  });

  it('live length is the wall length or the opening width', () => {
    expect(
      liveLength(applyFix(W3, { geometry: { start: { x: 0, y: 120 }, end: { x: 150, y: 120 } } })),
    ).toBe(150);
    expect(liveLength(DOOR)).toBe(36);
    expect(liveLength(ROOM)).toBeNull();
  });

  it('a fix that does not fit the item is ignored', () => {
    expect(parseFix(W1, { center: { x: 1, y: 1 }, width: 3 })).toBeNull();
    expect(parseFix(DOOR, { center: { x: 1, y: 1 }, width: -3 })).toBeNull();
    expect(parseFix(ROOM, { boundary: [{ x: 0, y: 0 }] })).toBeNull();
    expect(applyFix(W1, { center: { x: 1, y: 1 }, width: 3 } as never)).toBe(W1);
  });
});

describe('EZD-309 snaps as in the Plan editor (EZD-206: endpoint within 10 px, else 1/2" increments)', () => {
  it('a dragged wall end snaps to another wall’s end within 10 px', () => {
    // At 2 px per inch, (144.3, 119.8) is 0.36 in = 0.7 px from w2's start (144, 120).
    const r = snapHandle(ITEMS, W3, 'end', { x: 144.3, y: 119.8 }, 2);
    expect(r).toEqual({ point: { x: 144, y: 120 }, kind: 'endpoint' });
  });

  it('a room corner far from every wall rounds to 1/2"', () => {
    const r = snapHandle(ITEMS, ROOM, 'corner0', { x: 60.2, y: 60.3 }, 2);
    expect(r).toEqual({ point: { x: 60, y: 60.5 }, kind: 'increment' });
  });
});

describe('EZD-309 undo and redo of review actions', () => {
  it('undo goes back one action and redo applies it again; a no-op adds no step', () => {
    let h = historyOf(EMPTY);
    h = commit(h, withDecision(h.present, 'w1', 'accepted'));
    h = commit(h, withDecision(h.present, 'w1', 'accepted'));
    expect(h.past).toHaveLength(1);
    h = commit(
      h,
      withFix(h.present, 'w3', { geometry: { start: { x: 0, y: 120 }, end: { x: 144, y: 118 } } }),
    );
    const fixed = h.present;
    h = undo(h);
    expect(h.present.fixes.w3).toBeUndefined();
    expect(h.present.decisions).toEqual({ w1: 'accepted' });
    expect(changedIds(fixed, h.present)).toEqual(['w3']);
    expect(changeFor(h.present, 'w3')).toEqual({ item_id: 'w3', decision: null, fix: null });
    h = redo(h);
    expect(h.present).toBe(fixed);
    expect(undo(undo(undo(h))).present).toEqual(EMPTY);
  });
});

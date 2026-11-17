// EZD-309 (S02 Controls Fix selected "move endpoints, change size", Drag endpoint / edge "Moves wall ends or
// opening edges with live dimensions; Snaps as in Plan editor", Delete, Ctrl/Cmd+Z; Decisions "Finish import
// requires every item to be resolved (accepted, fixed or deleted)"; AC-EZD-309-1, -2): fixes and the review state.
// Pure, so the page, the server read and the tests share it.
// - A fix is the item's corrected geometry: a wall's two ends, an opening's centre and width (its two edges along
//   the host wall), a room's corners. It is merged over the detected item; the scan value stays the detected one.
// - Fixing an item accepts it (a fixed item is resolved and is written by Finish import, EZD-313).
// - finishItems: what Finish import writes, the accepted items with their fixes (AC-EZD-309-1).
// - The review state (decisions and fixes) has a session undo / redo history; every action reports the item ids it
//   changed, so the page saves those items' rows (an undo back to unresolved removes the saved row).
import {
  createWallSnapIndex,
  DEFAULT_WALL_LAYERS,
  snap,
  type SnapKind,
  type WallObject,
} from '@ezdraft/geometry';
import type { Decision, Decisions, Pt, ReviewItem, ReviewOpening, ReviewWall } from './review';

// EZD-310: `typed` is the typed or laser value (in) that set the fix (lib/imports/review-conflicts.ts).
export type WallFix = { geometry: { start: Pt; end: Pt }; typed?: number };
export type OpeningFix = { center: Pt; width: number; typed?: number };
// EZD-311: `keep` is Keep the room out of square, with the gap vector (in) it accepted (lib/imports/review-conflicts.ts).
export type RoomFix = { boundary: Pt[]; keep?: { gap: Pt } };
export type ItemFix = WallFix | OpeningFix | RoomFix;
export type Fixes = Readonly<Record<string, ItemFix>>;

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const isPt = (p: unknown): p is Pt =>
  typeof p === 'object' && p !== null && finite((p as Pt).x) && finite((p as Pt).y);
const copy = (p: Pt): Pt => ({ x: p.x, y: p.y });

/** The fix read back from storage, checked against the item's type; null when it does not fit the item. */
export function parseFix(item: ReviewItem, raw: unknown): ItemFix | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (item.type === 'wall') {
    const g = r.geometry as Record<string, unknown> | undefined;
    if (!g || !isPt(g.start) || !isPt(g.end)) return null;
    const wall: WallFix = { geometry: { start: copy(g.start), end: copy(g.end) } };
    if (finite(r.typed) && r.typed > 0) wall.typed = r.typed;
    return wall;
  }
  if (item.type === 'opening') {
    if (!isPt(r.center) || !finite(r.width) || r.width <= 0) return null;
    const opening: OpeningFix = { center: copy(r.center), width: r.width };
    if (finite(r.typed) && r.typed > 0) opening.typed = r.typed;
    return opening;
  }
  if (
    !Array.isArray(r.boundary) ||
    r.boundary.length !== item.boundary.length ||
    !r.boundary.every(isPt)
  ) {
    return null;
  }
  const room: RoomFix = { boundary: (r.boundary as Pt[]).map(copy) };
  const keep = r.keep as Record<string, unknown> | undefined;
  if (keep && isPt(keep.gap)) room.keep = { gap: copy(keep.gap) };
  return room;
}

/** Shoelace area of a closed boundary, square inches. */
export function polygonArea(pts: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** The item with its fix merged in; the item itself when there is no fix or it does not fit. */
export function applyFix(item: ReviewItem, fix: ItemFix | undefined): ReviewItem {
  const f = fix ? parseFix(item, fix) : null;
  if (!f) return item;
  if (item.type === 'wall') return { ...item, geometry: (f as WallFix).geometry };
  if (item.type === 'opening') {
    const o = f as OpeningFix;
    return { ...item, center: o.center, width: o.width };
  }
  const { boundary, keep } = f as RoomFix;
  const room = { ...item, boundary, areaSqIn: item.closed ? polygonArea(boundary) : item.areaSqIn };
  // EZD-311: a room kept out of square carries the gap it accepted to Finish import (closureOverride, EZD-313).
  if (keep) room.keptGap = copy(keep.gap);
  return room;
}

/** Every item with its fix: what the canvas draws. */
export const fixedItems = (items: readonly ReviewItem[], fixes: Fixes): ReviewItem[] =>
  items.map((i) => applyFix(i, fixes[i.id]));

/**
 * What Finish import writes (S02 Finish import "Writes accepted items to the model"; AC-EZD-309-1): every accepted
 * item, fixed or not, in detection order, a fixed item at its fixed position. Rejected and unresolved items are
 * left out (a deleted item "does not become model data").
 */
export function finishItems(
  items: readonly ReviewItem[],
  decisions: Decisions,
  fixes: Fixes,
): ReviewItem[] {
  return items.filter((i) => decisions[i.id] === 'accepted').map((i) => applyFix(i, fixes[i.id]));
}

// ---- Handles (Fix mode) ----

/** A drag handle of the item in Fix mode: a wall end, an opening edge or a room corner. */
export type Handle = { key: string; point: Pt };

function hostAxis(item: ReviewOpening, items: readonly ReviewItem[]): Pt {
  const host = items.find((w): w is ReviewWall => w.type === 'wall' && w.id === item.hostWallId);
  if (!host) return { x: 1, y: 0 };
  const dx = host.geometry.end.x - host.geometry.start.x;
  const dy = host.geometry.end.y - host.geometry.start.y;
  const len = Math.hypot(dx, dy);
  return len === 0 ? { x: 1, y: 0 } : { x: dx / len, y: dy / len };
}

/** The two edges of an opening along its host wall (its centre ± half its width). */
export function openingEdges(item: ReviewOpening, items: readonly ReviewItem[]): [Pt, Pt] {
  const u = hostAxis(item, items);
  const h = item.width / 2;
  return [
    { x: item.center.x - u.x * h, y: item.center.y - u.y * h },
    { x: item.center.x + u.x * h, y: item.center.y + u.y * h },
  ];
}

/** Handles of an item as it stands (fix applied); `items` gives openings their host wall. */
export function itemHandles(item: ReviewItem, items: readonly ReviewItem[]): Handle[] {
  if (item.type === 'wall') {
    return [
      { key: 'start', point: item.geometry.start },
      { key: 'end', point: item.geometry.end },
    ];
  }
  if (item.type === 'opening') {
    const [a, b] = openingEdges(item, items);
    return [
      { key: 'edge0', point: a },
      { key: 'edge1', point: b },
    ];
  }
  return item.boundary.map((p, i) => ({ key: `corner${i}`, point: p }));
}

/**
 * The fix after dragging handle `key` of `item` (as it stands) to `to`. A wall end moves to the point; an opening
 * edge moves along its host wall (the other edge stays), at least 1 in wide; a room corner moves to the point.
 */
export function dragHandle(
  item: ReviewItem,
  items: readonly ReviewItem[],
  key: string,
  to: Pt,
): ItemFix {
  if (item.type === 'wall') {
    const { start, end } = item.geometry;
    return {
      geometry:
        key === 'start'
          ? { start: copy(to), end: copy(end) }
          : { start: copy(start), end: copy(to) },
    };
  }
  if (item.type === 'opening') {
    const u = hostAxis(item, items);
    const [a, b] = openingEdges(item, items);
    const fixed = key === 'edge0' ? b : a;
    // The moved edge's position along the wall axis, measured from the fixed edge.
    let t = (to.x - fixed.x) * u.x + (to.y - fixed.y) * u.y;
    const sign = key === 'edge0' ? -1 : 1;
    if (t * sign < 1) t = sign;
    const moved = { x: fixed.x + u.x * t, y: fixed.y + u.y * t };
    return {
      center: { x: (fixed.x + moved.x) / 2, y: (fixed.y + moved.y) / 2 },
      width: Math.abs(t),
    };
  }
  const i = Number(key.replace('corner', ''));
  const boundary = item.boundary.map((p, n) => (n === i ? copy(to) : copy(p)));
  // EZD-311: moving a corner keeps Keep the room out of square.
  return item.keptGap ? { boundary, keep: { gap: copy(item.keptGap) } } : { boundary };
}

/** Length shown while dragging (S02 "live dimensions"): the wall's length or the opening's width, inches. */
export function liveLength(item: ReviewItem): number | null {
  if (item.type === 'wall') {
    const { start, end } = item.geometry;
    return Math.hypot(end.x - start.x, end.y - start.y);
  }
  if (item.type === 'opening') return item.width;
  return null;
}

// ---- Snaps (S02 "Snaps as in Plan editor") ----

const DEFAULT_THICKNESS_IN = 4.5;

function wallObject(w: ReviewWall): WallObject {
  const thickness = w.thickness && w.thickness > 0 ? w.thickness : DEFAULT_THICKNESS_IN;
  return {
    id: w.id,
    type: 'wall',
    data: {
      geometry: { start: w.geometry.start, end: w.geometry.end },
      status: 'existing',
      level: '00000000-0000-4000-8000-000000000000',
      attributes: {
        thickness,
        thicknessSide: 'center',
        height: 96,
        topCutToCeiling: false,
        bearing: false,
        layers:
          thickness === DEFAULT_THICKNESS_IN
            ? [...DEFAULT_WALL_LAYERS]
            : [{ material: 'stud', thickness }],
      },
    },
  };
}

/**
 * Where a dragged handle lands: the Plan editor's snap (EZD-206: wall endpoints, midpoints and faces within
 * 10 px, then angle and 1/2" increments from the anchor) against the other walls of the review. A wall end
 * is anchored at the wall's other end; other handles have no anchor (increments only).
 */
export function snapHandle(
  items: readonly ReviewItem[],
  item: ReviewItem,
  key: string,
  cursor: Pt,
  pixelsPerInch: number,
): { point: Pt; kind: SnapKind | null } {
  const walls = items
    .filter((i): i is ReviewWall => i.type === 'wall' && i.id !== item.id)
    .map(wallObject);
  const index = createWallSnapIndex(walls);
  const anchor =
    item.type === 'wall' ? (key === 'start' ? item.geometry.end : item.geometry.start) : null;
  const r = snap(index, { cursor, pixelsPerInch, anchor, referenceDirection: null });
  return { point: r.point, kind: r.kind };
}

// ---- Review state with undo / redo (S02 Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z "Undo / redo review actions; Session only") ----

export type ReviewState = { decisions: Decisions; fixes: Fixes };
export type History = { past: ReviewState[]; present: ReviewState; future: ReviewState[] };

export const historyOf = (present: ReviewState): History => ({ past: [], present, future: [] });

/** Ids whose decision or fix differ between two states (the rows a save must write). */
export function changedIds(a: ReviewState, b: ReviewState): string[] {
  const ids = new Set([
    ...Object.keys(a.decisions),
    ...Object.keys(b.decisions),
    ...Object.keys(a.fixes),
    ...Object.keys(b.fixes),
  ]);
  return [...ids].filter(
    (id) =>
      a.decisions[id] !== b.decisions[id] ||
      JSON.stringify(a.fixes[id] ?? null) !== JSON.stringify(b.fixes[id] ?? null),
  );
}

/** Apply one review action; a no-op action leaves the history as it was. */
export function commit(h: History, next: ReviewState): History {
  if (changedIds(h.present, next).length === 0) return h;
  return { past: [...h.past, h.present], present: next, future: [] };
}

export function undo(h: History): History {
  const prev = h.past[h.past.length - 1];
  if (!prev) return h;
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
}

export function redo(h: History): History {
  const next = h.future[0];
  if (!next) return h;
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
}

/** Fix one item: the fix is kept and the item accepted (S02 "resolved (accepted, fixed or deleted)"). */
export function withFix(s: ReviewState, id: string, fix: ItemFix): ReviewState {
  return { decisions: { ...s.decisions, [id]: 'accepted' }, fixes: { ...s.fixes, [id]: fix } };
}

/** Set decisions (Accept, Reject, Delete, Accept N); fixes stay as they are. */
export const withDecisions = (s: ReviewState, decisions: Decisions): ReviewState => ({
  ...s,
  decisions,
});

export const withDecision = (s: ReviewState, id: string, d: Decision): ReviewState => ({
  ...s,
  decisions: { ...s.decisions, [id]: d },
});

/** One saved row of the review (import_review_item): both null removes it. */
export type ReviewChange = { item_id: string; decision: Decision | null; fix: ItemFix | null };

export const changeFor = (s: ReviewState, id: string): ReviewChange => ({
  item_id: id,
  decision: s.decisions[id] ?? null,
  fix: s.fixes[id] ?? null,
});

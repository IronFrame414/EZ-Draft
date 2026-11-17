// EZD-307 (S02 Layout, Controls, Data shown; phase-03 EZD-307): what Import review shows, worked out from the
// detected items of an import (EZD-302 import_session.items). Pure, so the screen and its tests share it.
// - Summary line: found, high confidence, to check (S02 Controls "Summary line").
// - To check: items below the high-confidence cutoff (S02 Validation), highest confidence first (board S02).
// - Accepted: counts of the walls, windows, doors, rooms, fixtures + cabinets accepted in this review (S02 Controls
//   "Accepted summary"; EZD-308 counts decisions, so after Accept N on board S02's data they read 11 + 4 + 2 + 3 + 16
//   = 36, the board's numbers).
// - EZD-308 review modes: decisions (accept, reject), Accept N over high-confidence items only, One by one steps and
//   By room groups (S02 Controls Mode; Decisions).
// - Labels and scan values for the list and inspector (S02 Data shown "type, label, status, confidence %").
import { formatLength, PLAN_DISPLAY_DENOMINATOR } from '@ezdraft/geometry';

export type Pt = { x: number; y: number };
export type Side = 'north' | 'east' | 'south' | 'west';

export type ReviewWall = {
  id: string;
  type: 'wall';
  number: number;
  side: Side;
  confidence: number;
  geometry: { start: Pt; end: Pt };
  thickness: number | null;
};

export type ReviewOpening = {
  id: string;
  type: 'opening';
  kind: 'door' | 'window';
  number: number;
  confidence: number;
  hostWallId: string | null;
  width: number;
  center: Pt;
};

export type ReviewRoom = {
  id: string;
  type: 'room';
  number: number;
  confidence: number;
  boundary: Pt[];
  closed: boolean;
  areaSqIn: number;
  /** EZD-311: the gap (in) the room was kept out of square on; set from its fix (lib/imports/review-fix.ts). */
  keptGap?: Pt;
};

export type ReviewItem = ReviewWall | ReviewOpening | ReviewRoom;

/**
 * The high-confidence cutoff (%) used while the company's Defaults value is Not set. S15d makes the cutoff a
 * company setting the owner enters (Round 24; Defaults row high_confidence_cutoff, EZD-116); EZD-308 reads it on
 * the server and falls back to this value, the one EZD-307 used (vault/build/assumptions.md EZD-307, EZD-308).
 */
export const DEFAULT_HIGH_CONFIDENCE_CUTOFF = 80;

/** The cutoff a review uses: the effective Defaults value when it is a percent, else the fallback. */
export function reviewCutoff(effective: unknown): number {
  return typeof effective === 'number' && Number.isFinite(effective) && effective >= 0 && effective <= 100
    ? effective
    : DEFAULT_HIGH_CONFIDENCE_CUTOFF;
}

/** At the cutoff counts as high confidence (S02 Validation: "below the high-confidence cutoff goes to To check"). */
export const isHighConfidence = (item: ReviewItem, cutoff: number): boolean => item.confidence >= cutoff;

// ---- Review decisions (EZD-308) ----
// What the user did with each item in this review: accepted, or rejected (removed; it does not become model data,
// S02 Controls Delete / Reject). An item with no decision is unresolved. EZD-309 saves them per item.

export type Decision = 'accepted' | 'rejected';
export type Decisions = Readonly<Record<string, Decision>>;

/** The review modes (S02 Controls Mode; import_session.mode values). Accept + fix is the default (board S02). */
export type ReviewMode = 'one_by_one' | 'accept_fix' | 'by_room';
export const REVIEW_MODES: readonly ReviewMode[] = ['one_by_one', 'accept_fix', 'by_room'];
export const DEFAULT_REVIEW_MODE: ReviewMode = 'accept_fix';

export const isResolved = (item: ReviewItem, decisions: Decisions): boolean =>
  decisions[item.id] !== undefined;

export type AcceptedCounts = {
  walls: number;
  windows: number;
  doors: number;
  rooms: number;
  fixtures: number;
};

export type ReviewSummary = {
  found: number;
  highConfidence: number;
  toCheck: number;
  accepted: AcceptedCounts;
};

/**
 * The summary line and the Accepted section (S02 Controls). found and high confidence are fixed by detection;
 * to check counts the low-confidence items still unresolved ("Updates as items are resolved"); Accepted counts
 * the items accepted in this review, by type.
 */
export function reviewSummary(
  items: readonly ReviewItem[],
  cutoff: number,
  decisions: Decisions = {},
): ReviewSummary {
  const accepted: AcceptedCounts = { walls: 0, windows: 0, doors: 0, rooms: 0, fixtures: 0 };
  let high = 0;
  let toCheck = 0;
  for (const item of items) {
    if (isHighConfidence(item, cutoff)) high += 1;
    else if (!isResolved(item, decisions)) toCheck += 1;
    if (decisions[item.id] !== 'accepted') continue;
    if (item.type === 'wall') accepted.walls += 1;
    else if (item.type === 'room') accepted.rooms += 1;
    else if (item.kind === 'door') accepted.doors += 1;
    else accepted.windows += 1;
  }
  return { found: items.length, highConfidence: high, toCheck, accepted };
}

/** To check items still unresolved, highest confidence first; ties keep the detection order. */
export function toCheckItems(
  items: readonly ReviewItem[],
  cutoff: number,
  decisions: Decisions = {},
): ReviewItem[] {
  return items
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => !isHighConfidence(item, cutoff) && !isResolved(item, decisions))
    .sort((a, b) => b.item.confidence - a.item.confidence || a.i - b.i)
    .map(({ item }) => item);
}

/** The items Accept N would accept: high confidence and still unresolved. N is their count (S02 "Label shows count"). */
export function pendingHighConfidence(
  items: readonly ReviewItem[],
  cutoff: number,
  decisions: Decisions,
): ReviewItem[] {
  return items.filter((item) => isHighConfidence(item, cutoff) && !isResolved(item, decisions));
}

/**
 * Accept N (S02 Controls; Decisions "Accept N accepts only high-confidence items. Each To check item needs its own
 * action"): accepts every unresolved item at or above the cutoff and nothing else. A rejected item stays rejected.
 */
export function acceptHighConfidence(
  items: readonly ReviewItem[],
  cutoff: number,
  decisions: Decisions,
): Decisions {
  const next: Record<string, Decision> = { ...decisions };
  for (const item of pendingHighConfidence(items, cutoff, decisions)) next[item.id] = 'accepted';
  return next;
}

/** One item's decision (One by one Accept / Reject this item). */
export function decide(decisions: Decisions, id: string, decision: Decision): Decisions {
  return { ...decisions, [id]: decision };
}

/**
 * One by one (S02 Controls "Steps through every detected item in order"): the item `step` places from `currentId`
 * in detection order. It stops at the first and last item; with no current item it starts at the first.
 */
export function stepItem(
  items: readonly ReviewItem[],
  currentId: string | null,
  step: 1 | -1,
): string | null {
  if (items.length === 0) return null;
  const at = items.findIndex((i) => i.id === currentId);
  if (at < 0) return items[0].id;
  const to = Math.min(items.length - 1, Math.max(0, at + step));
  return items[to].id;
}

/** Where One by one starts: the first unresolved item in detection order, else the first item. */
export function firstUnresolved(items: readonly ReviewItem[], decisions: Decisions): string | null {
  return (items.find((i) => !isResolved(i, decisions)) ?? items[0])?.id ?? null;
}

// ---- By room (S02 Controls "Groups items by detected room; accept or fix room by room") ----

export type RoomGroup = { room: ReviewRoom | null; items: ReviewItem[] };

function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distanceToBoundary(p: Pt, room: ReviewRoom): number {
  const b = room.boundary;
  let best = Infinity;
  const n = room.closed ? b.length : b.length - 1;
  for (let i = 0; i < n; i += 1) best = Math.min(best, distanceToSegment(p, b[i], b[(i + 1) % b.length]));
  return best;
}

/** How far a point may sit from a room's boundary and still belong to it: half the wall, at least 6 in. */
export const ROOM_EDGE_REACH_IN = 6;

const reach = (thickness: number | null) => Math.max(ROOM_EDGE_REACH_IN, (thickness ?? 0) / 2);

/**
 * Items grouped by detected room, rooms in their number order, then the items in no room. A wall belongs to the
 * first room (by number) whose boundary both its ends sit on; an opening goes with its host wall, or by its centre
 * when it has none; a room is the head of its own group. Every item is in exactly one group.
 */
export function roomGroups(items: readonly ReviewItem[]): RoomGroup[] {
  const rooms = items
    .filter((i): i is ReviewRoom => i.type === 'room')
    .sort((a, b) => a.number - b.number);
  const groups = new Map<string | null, ReviewItem[]>(rooms.map((r) => [r.id, [r]]));
  groups.set(null, []);
  const wallRoom = new Map<string, string | null>();
  const on = (p: Pt, room: ReviewRoom, r: number) => room.boundary.length > 1 && distanceToBoundary(p, room) <= r;
  for (const item of items) {
    if (item.type !== 'wall') continue;
    const r = reach(item.thickness);
    const room = rooms.find((rm) => on(item.geometry.start, rm, r) && on(item.geometry.end, rm, r));
    wallRoom.set(item.id, room?.id ?? null);
  }
  for (const item of items) {
    if (item.type === 'room') continue;
    let roomId: string | null;
    if (item.type === 'wall') roomId = wallRoom.get(item.id) ?? null;
    else if (item.hostWallId !== null && wallRoom.has(item.hostWallId)) roomId = wallRoom.get(item.hostWallId) ?? null;
    else roomId = rooms.find((rm) => on(item.center, rm, ROOM_EDGE_REACH_IN))?.id ?? null;
    groups.get(roomId)?.push(item);
  }
  const out: RoomGroup[] = rooms.map((room) => ({ room, items: groups.get(room.id) ?? [] }));
  const loose = groups.get(null) ?? [];
  if (loose.length > 0) out.push({ room: null, items: loose });
  return out;
}

const SIDE_WORD: Record<Side, string> = {
  north: 'North',
  east: 'East',
  south: 'South',
  west: 'West',
};

/**
 * The item's label (S02 Data shown, e.g. "North wall", "Window W3", "Door D2"): a wall is named by its side, with
 * its number when another wall is on the same side; openings by their letter and number; rooms "Room n".
 */
export function itemLabel(item: ReviewItem, items: readonly ReviewItem[]): string {
  if (item.type === 'wall') {
    const shared = items.some((o) => o.type === 'wall' && o.id !== item.id && o.side === item.side);
    return shared ? `${SIDE_WORD[item.side]} wall ${item.number}` : `${SIDE_WORD[item.side]} wall`;
  }
  if (item.type === 'room') return `Room ${item.number}`;
  return item.kind === 'door' ? `Door D${item.number}` : `Window W${item.number}`;
}

export type ItemTypeWord = 'Wall' | 'Door' | 'Window' | 'Room';

export function itemTypeWord(item: ReviewItem): ItemTypeWord {
  if (item.type === 'wall') return 'Wall';
  if (item.type === 'room') return 'Room';
  return item.kind === 'door' ? 'Door' : 'Window';
}

/** What the scan reads for the item (S02 Inspector "Scan reads"): wall length, opening width, room area. */
export function scanReads(item: ReviewItem): string {
  if (item.type === 'wall') {
    const { start, end } = item.geometry;
    return formatLength(Math.hypot(end.x - start.x, end.y - start.y), PLAN_DISPLAY_DENOMINATOR);
  }
  if (item.type === 'opening') return formatLength(item.width, PLAN_DISPLAY_DENOMINATOR);
  return `${Math.round(item.areaSqIn / 144)} SF`;
}

export type ReviewFile = { name: string; kind: string };

/** Status bar source: "Polycam Space · DXF + GLB" (board S02), "Polycam Space · DXF" without a mesh. */
export function sourceLine(files: readonly ReviewFile[]): string {
  const hasMesh = files.some((f) => f.kind === 'polycam_glb');
  return hasMesh ? 'Polycam Space · DXF + GLB' : 'Polycam Space · DXF';
}

export type Extents = { minX: number; minY: number; maxX: number; maxY: number };

/** Plan extents of every item, for Fit; null when there is nothing to draw. */
export function itemExtents(items: readonly ReviewItem[]): Extents | null {
  const pts: Pt[] = [];
  for (const item of items) {
    if (item.type === 'wall') pts.push(item.geometry.start, item.geometry.end);
    else if (item.type === 'room') pts.push(...item.boundary);
    else pts.push(item.center);
  }
  if (pts.length === 0) return null;
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}

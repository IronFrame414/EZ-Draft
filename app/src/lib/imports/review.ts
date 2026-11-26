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
import { formatInches } from '../catalog/catalog';

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
  /** EZD-314 (S02 Validation "Bearing walls detected or marked: flagged"): the import read the wall as bearing. */
  bearing?: boolean;
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
  /** EZD-1418: the room's name as typed or picked on the phone (S17b + Room); a scan's rooms have none. */
  name?: string;
};

/**
 * EZD-312 (S02 Data shown "Ceiling slope, east"; Decisions "Ceiling slope items are fixed in the inspector with the
 * same three inputs as Round 1: heights at points (low/high wall), pitch, or the value read from the mesh"): a
 * single-slope ceiling read for a room. The ceiling rises from the low wall to the high wall, `run` inches apart;
 * heights are inches above the floor and pitch is rise per 12 (S05 "9.4/12").
 */
export type ReviewCeilingSlope = {
  id: string;
  type: 'ceiling_slope';
  number: number;
  confidence: number;
  roomId: string | null;
  lowSide: Side;
  highSide: Side;
  run: number;
  lowHeight: number;
  highHeight: number;
  pitchPer12: number;
};

/** EZD-915: the box types a supplier cabinet label names (the seed line's codes B, DB, SB and W; assumptions). */
export type CabinetLabelType = 'base' | 'drawer_base' | 'sink_base' | 'wall';

/** EZD-915: how one view of a supplier PDF reads against the cabinet's label. */
export type CabinetViewCheck = 'agrees' | 'differs' | 'missing';

/**
 * EZD-915 (S12 Supplier PDF import "cabinet labels set size and type; plan and elevations cross-checked; result goes
 * to Import review with confidence colors"; S02 States "Supplier kitchen PDF: cabinet labels read (W3030, B24) and
 * plan vs elevation cross-check results shown per cabinet"): a cabinet box read from a supplier PDF's plan. Its type
 * and size come from its label; `outline` is the box drawn around the label on the plan (model inches), and `check`
 * says whether the plan outline and the elevation agree with the label, with what each measured.
 */
export type ReviewCabinet = {
  id: string;
  type: 'cabinet';
  number: number;
  confidence: number;
  code: string;
  boxType: CabinetLabelType;
  width: number;
  depth: number;
  height: number;
  center: Pt;
  outline: { min: Pt; max: Pt } | null;
  /** Cabinets whose plan outlines touch share a run number (1, 2, ...). */
  run: number;
  check: {
    plan: CabinetViewCheck;
    elevation: CabinetViewCheck;
    /** The plan outline's two sides (in), larger first; null without an outline. */
    planSize: { long: number; short: number } | null;
    elevationSize: { width: number; height: number } | null;
  };
};

/**
 * EZD-916 (S12 Order report import "Reads codes, sizes, finishes and order line numbers; lines become the reference
 * for tags"; Data shown "Order report lines: line no, code, width, face, finish"; Decisions 2 "shown in Import review
 * for the user to confirm"): one line of a supplier's 2020 order report. Width in inches; face, finish and width are
 * null when the report does not give them. It has no plan position.
 */
export type ReviewOrderLine = {
  id: string;
  type: 'order_line';
  number: number;
  confidence: number;
  lineNo: number;
  code: string;
  width: number | null;
  face: string | null;
  finish: string | null;
};

export type ReviewItem =
  | ReviewWall
  | ReviewOpening
  | ReviewRoom
  | ReviewCeilingSlope
  | ReviewCabinet
  | ReviewOrderLine;

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
    else if (item.type === 'ceiling_slope') continue;
    // EZD-915: a cabinet counts with "fixtures + cabinets" (S02 Controls Accepted summary).
    else if (item.type === 'cabinet') accepted.fixtures += 1;
    // EZD-916: an order line is not model data, so it counts in no plan total.
    else if (item.type === 'order_line') continue;
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

/** EZD-915: a point inside a room's boundary (ray casting) or within reach of its edge. */
function inRoom(p: Pt, room: ReviewRoom): boolean {
  const b = room.boundary;
  if (b.length < 2) return false;
  if (distanceToBoundary(p, room) <= ROOM_EDGE_REACH_IN) return true;
  if (!room.closed) return false;
  let inside = false;
  for (let i = 0, j = b.length - 1; i < b.length; j = i, i += 1) {
    if (b[i].y > p.y !== b[j].y > p.y && p.x < ((b[j].x - b[i].x) * (p.y - b[i].y)) / (b[j].y - b[i].y) + b[i].x) {
      inside = !inside;
    }
  }
  return inside;
}


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
    // EZD-312: a ceiling slope goes with the room it was read for.
    else if (item.type === 'ceiling_slope')
      roomId = item.roomId !== null && groups.has(item.roomId) ? item.roomId : null;
    // EZD-915: a cabinet goes with the room its centre is in or on.
    else if (item.type === 'cabinet') roomId = rooms.find((rm) => inRoom(item.center, rm))?.id ?? null;
    // EZD-916: an order line has no plan position, so it is in no room.
    else if (item.type === 'order_line') roomId = null;
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
  // EZD-312: "Ceiling slope, east" (S02 Data shown; board S02), named by the side it rises toward.
  if (item.type === 'ceiling_slope') return `Ceiling slope, ${item.highSide}`;
  // EZD-915: a cabinet by its label (S02 States "cabinet labels read (W3030, B24)").
  if (item.type === 'cabinet') return `Cabinet ${item.code}`;
  // EZD-916: "Line #7 · SB36" (wording for Josh to confirm, assumptions EZD-916).
  if (item.type === 'order_line') return `Line #${item.lineNo} · ${item.code}`;
  return item.kind === 'door' ? `Door D${item.number}` : `Window W${item.number}`;
}

export type ItemTypeWord = 'Wall' | 'Door' | 'Window' | 'Room' | 'Ceiling' | 'Cabinet' | 'Order line';

export function itemTypeWord(item: ReviewItem): ItemTypeWord {
  if (item.type === 'wall') return 'Wall';
  if (item.type === 'room') return 'Room';
  if (item.type === 'ceiling_slope') return 'Ceiling';
  if (item.type === 'cabinet') return 'Cabinet';
  if (item.type === 'order_line') return 'Order line';
  return item.kind === 'door' ? 'Door' : 'Window';
}

/** What the scan reads for the item (S02 Inspector "Scan reads"): wall length, opening width, room area. */
export function scanReads(item: ReviewItem): string {
  if (item.type === 'wall') {
    const { start, end } = item.geometry;
    return formatLength(Math.hypot(end.x - start.x, end.y - start.y), PLAN_DISPLAY_DENOMINATOR);
  }
  if (item.type === 'opening') return formatLength(item.width, PLAN_DISPLAY_DENOMINATOR);
  if (item.type === 'ceiling_slope') return slopeText(item);
  if (item.type === 'cabinet') return cabinetSizeText(item);
  if (item.type === 'order_line') return orderLineText(item);
  return `${Math.round(item.areaSqIn / 144)} SF`;
}

/** EZD-312: a slope as S05's summary writes it, e.g. "8' 0\" to 12' 0\" · 4/12". */
export function slopeText(s: { lowHeight: number; highHeight: number; pitchPer12: number }): string {
  const pitch = Math.round(s.pitchPer12 * 10) / 10;
  return `${formatLength(s.lowHeight, PLAN_DISPLAY_DENOMINATOR)} to ${formatLength(s.highHeight, PLAN_DISPLAY_DENOMINATOR)} · ${pitch}/12`;
}

/**
 * EZD-915: a cabinet's size from its label, W x D x H (S12 Data shown "Plan boxes: ... W x D x H") in inches as the
 * catalog card writes sizes (formatInches), e.g. "24 × 24 × 34 1/2".
 */
export function cabinetSizeText(c: { width: number; depth: number; height: number }): string {
  return [c.width, c.depth, c.height].map(formatInches).join(' × ');
}

/**
 * EZD-916 (S12 Data shown "Order report lines: line no, code, width, face, finish"): what the report reads for a
 * line, width (inches, as the catalog writes sizes, with the inch mark), face and finish, the ones it gives, e.g.
 * '36" · FD + 2 doors · Shaker, White'.
 */
export function orderLineText(l: Pick<ReviewOrderLine, 'width' | 'face' | 'finish'>): string {
  return [l.width === null ? null : `${formatInches(l.width)}"`, l.face, l.finish]
    .filter((v): v is string => v !== null && v !== '')
    .join(' · ');
}

export type CabinetCheckLine = {
  view: 'plan' | 'elevation';
  state: CabinetViewCheck;
  /** What the view measured in inches, e.g. "27 × 34 1/2"; null when nothing was measured. */
  size: string | null;
};

/**
 * EZD-915 (S02 States "plan vs elevation cross-check results shown per cabinet"): one line per view for the
 * inspector: the view agrees with the label, reads another size, or was not found (a plan box with no outline).
 */
export function cabinetCheckLines(c: ReviewCabinet): CabinetCheckLine[] {
  const p = c.check.planSize;
  const e = c.check.elevationSize;
  const line = (view: CabinetCheckLine['view'], size: string | null): CabinetCheckLine => ({
    view,
    state: size === null ? 'missing' : c.check[view],
    size,
  });
  return [
    line('plan', p ? `${formatInches(p.long)} × ${formatInches(p.short)}` : null),
    line('elevation', e ? `${formatInches(e.width)} × ${formatInches(e.height)}` : null),
  ];
}

export type ReviewFile = { name: string; kind: string };

/**
 * Status bar source: "Polycam Space · DXF + GLB" (board S02), "Polycam Space · DXF" without a mesh. EZD-305: an
 * import from a PDF drawing alone reads "PDF" (wording for Josh to confirm, vault/build/assumptions.md EZD-305).
 */
export function sourceLine(files: readonly ReviewFile[]): string {
  const scan = files.some((f) => f.kind === 'polycam_dxf' || f.kind === 'polycam_glb');
  if (!scan && files.length > 0 && files.every((f) => f.kind === 'pdf')) return 'PDF';
  // EZD-915: an import from supplier PDFs alone (wording for Josh to confirm, assumptions EZD-915).
  if (!scan && files.length > 0 && files.every((f) => f.kind === 'supplier_pdf')) return 'Supplier PDF';
  // EZD-916: an import from order reports alone (wording for Josh to confirm, assumptions EZD-916).
  if (!scan && files.length > 0 && files.every((f) => f.kind === 'order_report')) return 'Order report';
  // EZD-1418: rooms sent from the phone (S02 Entry points "source kind field_measure"; assumptions EZD-1418).
  if (!scan && files.length > 0 && files.every((f) => f.kind === 'field_measure')) return 'Field measure';
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
    else if (item.type === 'opening') pts.push(item.center);
    else if (item.type === 'cabinet') pts.push(...(item.outline ? [item.outline.min, item.outline.max] : [item.center]));
  }
  if (pts.length === 0) return null;
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}

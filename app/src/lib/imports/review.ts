// EZD-307 (S02 Layout, Controls, Data shown; phase-03 EZD-307): what Import review shows, worked out from the
// detected items of an import (EZD-302 import_session.items). Pure, so the screen and its tests share it.
// - Summary line: found, high confidence, to check (S02 Controls "Summary line").
// - To check: items below the high-confidence cutoff (S02 Validation), highest confidence first (board S02).
// - Accepted: counts of walls, windows, doors, rooms, fixtures + cabinets (S02 Controls "Accepted summary"). Until
//   review actions exist (EZD-308/309) the high-confidence items are the ones counted here, as on board S02, where
//   the Accepted counts add up to the high-confidence count and Accept N carries the same number.
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
};

export type ReviewItem = ReviewWall | ReviewOpening | ReviewRoom;

/**
 * The high-confidence cutoff (%). S15d makes it a company setting under Defaults that the owner enters (Round 24);
 * that setting is built by EZD-308 with EZD-116 and replaces this value (vault/build/assumptions.md EZD-307).
 */
export const HIGH_CONFIDENCE_CUTOFF = 80;

export const isHighConfidence = (item: ReviewItem, cutoff = HIGH_CONFIDENCE_CUTOFF): boolean =>
  item.confidence >= cutoff;

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

export function reviewSummary(
  items: readonly ReviewItem[],
  cutoff = HIGH_CONFIDENCE_CUTOFF,
): ReviewSummary {
  const accepted: AcceptedCounts = { walls: 0, windows: 0, doors: 0, rooms: 0, fixtures: 0 };
  let high = 0;
  for (const item of items) {
    if (!isHighConfidence(item, cutoff)) continue;
    high += 1;
    if (item.type === 'wall') accepted.walls += 1;
    else if (item.type === 'room') accepted.rooms += 1;
    else if (item.kind === 'door') accepted.doors += 1;
    else accepted.windows += 1;
  }
  return { found: items.length, highConfidence: high, toCheck: items.length - high, accepted };
}

/** To check items, highest confidence first; ties keep the detection order. */
export function toCheckItems(
  items: readonly ReviewItem[],
  cutoff = HIGH_CONFIDENCE_CUTOFF,
): ReviewItem[] {
  return items
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => !isHighConfidence(item, cutoff))
    .sort((a, b) => b.item.confidence - a.item.confidence || a.i - b.i)
    .map(({ item }) => item);
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

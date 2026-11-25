// EZD-414 (AC-EZD-414-1 "The Seating preset sets 12" and labels the side "seating""; S04b Preset chips; S04b Overhang
// inputs; board S04bCountertops island "Cabinets 73 1/2 × 24", top "76 1/2 × 37 1/2", "Back · seating 12"").
// Hand counts, model y up:
//   Island cabinets x 0..73.5, y 0..24. At 1 1/2" all round the top is x −1.5..75, y −1.5..25.5 (76.5 × 27).
//   The back (side 1, y = −1.5) at the Seating preset 12" moves out by 10.5 to y = −12: the top is 76.5 × 37.5
//   (board) and the cabinets under it stay 76.5 − 1.5 − 1.5 = 73.5 by 37.5 − 12 − 1.5 = 24.
//   An L (0,0)(60,0)(60,25.5)(25.5,25.5)(25.5,60)(0,60): side 3 (y = 25.5 from x 60 to 25.5) at 1 1/2" set flush
//   moves in by 1.5 to y = 24; its corners slide along x = 60 and x = 25.5: (60,24) and (25.5,24).
import { describe, expect, it } from 'vitest';
import type { CountertopEdge, CountertopEdgeKind, CountertopPieceData, Point } from '../schema';
import { countertopPieceDataSchema } from '../schema/countertop';
import {
  COUNTERTOP_PRESET_FALLBACK,
  countertopEdgePreset,
  countertopOutlinesOverlap,
  countertopPresetEdge,
  countertopSides,
  countertopTypedEdge,
  setCountertopEdge,
} from './overhang';
import { countertopPieceSize } from './panel';

const LEVEL = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
const SEAM = 'e0000000-0000-4000-8000-000000000001';
const PROFILE = 'f0000000-0000-4000-8000-000000000001';
type E = CountertopEdgeKind | 'seam';
const edge = (kind: E, overhang = kind === 'exposed' ? 1.5 : 0): CountertopEdge =>
  kind === 'seam'
    ? { kind: 'wall', overhang: 0, backsplashHeight: null, profileId: null, seamId: SEAM }
    : { kind, overhang, backsplashHeight: kind === 'wall' ? 4 : null, profileId: null };
const piece = (outline: Point[], edges: CountertopEdge[], extra: Partial<CountertopPieceData['attributes']> = {}) =>
  ({
    geometry: { outline },
    status: 'new',
    level: LEVEL,
    attributes: { label: 'C', name: 'Island', materialItemId: null, thickness: 3 / 2.54, edges, ...extra },
  }) satisfies CountertopPieceData;

const islandPts = (): Point[] => [
  { x: -1.5, y: -1.5 },
  { x: 75, y: -1.5 },
  { x: 75, y: 25.5 },
  { x: -1.5, y: 25.5 },
];
const island = () => piece(islandPts(), [edge('exposed'), edge('exposed'), edge('exposed'), edge('exposed')]);
const V = COUNTERTOP_PRESET_FALLBACK;

describe('EZD-414 countertopPresetEdge (S04b preset chips)', () => {
  it('maps each chip to the spec value', () => {
    expect(countertopPresetEdge('flush', V)).toEqual({ kind: 'flush', overhang: 0, backsplashHeight: null });
    expect(countertopPresetEdge('standard', V)).toEqual({ kind: 'exposed', overhang: 1.5, backsplashHeight: null });
    expect(countertopPresetEdge('bar', V)).toEqual({ kind: 'seating', overhang: 10, backsplashHeight: null });
    expect(countertopPresetEdge('seating', V)).toEqual({ kind: 'seating', overhang: 12, backsplashHeight: null });
    expect(countertopPresetEdge('wall', V)).toEqual({ kind: 'wall', overhang: 0, backsplashHeight: 4 });
  });
});

describe('EZD-414 setCountertopEdge', () => {
  it('AC-EZD-414-1: the Seating preset sets the back to 12" seating and moves it out (board 76 1/2 × 37 1/2)', () => {
    const next = setCountertopEdge(island(), 0, countertopPresetEdge('seating', V))!;
    expect(next.attributes.edges[0]).toEqual({ kind: 'seating', overhang: 12, backsplashHeight: null, profileId: null });
    expect(next.geometry.outline).toEqual([
      { x: -1.5, y: -12 },
      { x: 75, y: -12 },
      { x: 75, y: 25.5 },
      { x: -1.5, y: 25.5 },
    ]);
    expect(countertopPieceSize(next)).toEqual({ length: 76.5, depth: 37.5 });
    expect(countertopPieceDataSchema.safeParse(next).success).toBe(true);
  });

  it('moves the same edge out on a clockwise outline', () => {
    const cw = piece([...islandPts()].reverse(), [edge('exposed'), edge('exposed'), edge('exposed'), edge('exposed')]);
    // Reversed corners (−1.5,25.5),(75,25.5),(75,−1.5),(−1.5,−1.5): index 2 runs (75,−1.5)→(−1.5,−1.5), the y = −1.5 side.
    const next = setCountertopEdge(cw, 2, countertopPresetEdge('seating', V))!;
    expect(next.geometry.outline).toEqual([
      { x: -1.5, y: 25.5 },
      { x: 75, y: 25.5 },
      { x: 75, y: -12 },
      { x: -1.5, y: -12 },
    ]);
  });

  it('slides the corners along the neighbouring sides of an L', () => {
    const L = piece(
      [
        { x: 0, y: 0 },
        { x: 60, y: 0 },
        { x: 60, y: 25.5 },
        { x: 25.5, y: 25.5 },
        { x: 25.5, y: 60 },
        { x: 0, y: 60 },
      ],
      [edge('wall'), edge('exposed'), edge('exposed'), edge('exposed'), edge('exposed'), edge('wall')],
    );
    const next = setCountertopEdge(L, 2, countertopPresetEdge('flush', V))!;
    expect(next.geometry.outline).toEqual([
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 24 },
      { x: 25.5, y: 24 },
      { x: 25.5, y: 60 },
      { x: 0, y: 60 },
    ]);
    expect(next.attributes.edges[2]).toEqual({ kind: 'flush', overhang: 0, backsplashHeight: null, profileId: null });
  });

  it('Wall + splash makes a wall edge with the splash and no profile', () => {
    const p = island();
    p.attributes.edges[0] = { ...edge('exposed'), profileId: PROFILE };
    const next = setCountertopEdge(p, 0, countertopPresetEdge('wall', V))!;
    expect(next.attributes.edges[0]).toEqual({ kind: 'wall', overhang: 0, backsplashHeight: 4, profileId: null });
    // 1 1/2" to 0: the side moves in by 1.5 to y = 0.
    expect(next.geometry.outline[0]).toEqual({ x: -1.5, y: 0 });
    expect(next.geometry.outline[1]).toEqual({ x: 75, y: 0 });
  });

  it('keeps the profile on an exposed edge', () => {
    const p = island();
    p.attributes.edges[2] = { ...edge('exposed'), profileId: PROFILE };
    const next = setCountertopEdge(p, 2, countertopPresetEdge('bar', V))!;
    expect(next.attributes.edges[2]).toEqual({ kind: 'seating', overhang: 10, backsplashHeight: null, profileId: PROFILE });
  });

  it('refuses a seam edge and an edge whose corner ends a seam', () => {
    const p = piece(
      [
        { x: 0, y: 25.5 },
        { x: 25.5, y: 25.5 },
        { x: 25.5, y: 88.5 },
        { x: 0, y: 88.5 },
      ],
      [edge('seam'), edge('exposed'), edge('exposed'), edge('wall')],
    );
    expect(setCountertopEdge(p, 0, countertopPresetEdge('standard', V))).toBeNull();
    expect(setCountertopEdge(p, 1, countertopPresetEdge('flush', V))).toBeNull();
    // The far end does not touch the seam: 1 1/2" to 12" moves y = 88.5 out to 99.
    const next = setCountertopEdge(p, 2, countertopPresetEdge('seating', V))!;
    expect(next.geometry.outline[2]).toEqual({ x: 25.5, y: 99 });
    // Same overhang, new kind: nothing moves, so a seam corner is no bar.
    expect(setCountertopEdge(p, 1, { kind: 'flush', overhang: 1.5, backsplashHeight: null })).not.toBeNull();
  });

  it('refuses a move that leaves a cutout off the top', () => {
    const p = piece(
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 25.5 },
        { x: 0, y: 25.5 },
      ],
      [edge('wall'), edge('exposed'), edge('exposed'), edge('exposed')],
      {
        cutouts: [
          {
            id: 'c0000000-0000-4000-8000-000000000001',
            kind: 'sink',
            center: { x: 20, y: 17 },
            axis: { x: 1, y: 0 },
            width: 30,
            depth: 16,
            fixtureId: null,
          },
        ],
      },
    );
    // The sink reaches y = 25; flush moves the front from 25.5 to 24.
    expect(setCountertopEdge(p, 2, countertopPresetEdge('flush', V))).toBeNull();
  });
});

describe('EZD-414 countertopTypedEdge (typed overhang, Round 23 seating 6"–12")', () => {
  it('derives the kind from the value', () => {
    expect(countertopTypedEdge(edge('exposed'), 0)).toEqual({ kind: 'flush', overhang: 0, backsplashHeight: null });
    expect(countertopTypedEdge(edge('exposed'), 1)).toEqual({ kind: 'exposed', overhang: 1, backsplashHeight: null });
    expect(countertopTypedEdge(edge('exposed'), 6)).toEqual({ kind: 'seating', overhang: 6, backsplashHeight: null });
    expect(countertopTypedEdge(edge('seating', 12), 2)).toEqual({ kind: 'exposed', overhang: 2, backsplashHeight: null });
    expect(countertopTypedEdge(edge('wall'), 0)).toEqual({ kind: 'wall', overhang: 0, backsplashHeight: 4 });
    expect(countertopTypedEdge(edge('wall'), 1.5)).toEqual({ kind: 'exposed', overhang: 1.5, backsplashHeight: null });
  });
});

describe('EZD-414 countertopEdgePreset', () => {
  it('names the chip an edge matches', () => {
    expect(countertopEdgePreset(edge('exposed'), V)).toBe('standard');
    expect(countertopEdgePreset(edge('seating', 12), V)).toBe('seating');
    expect(countertopEdgePreset(edge('seating', 10), V)).toBe('bar');
    expect(countertopEdgePreset(edge('flush'), V)).toBe('flush');
    expect(countertopEdgePreset(edge('wall'), V)).toBe('wall');
    expect(countertopEdgePreset(edge('seam'), V)).toBeNull();
    expect(countertopEdgePreset(edge('exposed', 2), V)).toBeNull();
  });
});

describe('EZD-414 countertopSides (Overhang by side diagram)', () => {
  it('reads back, front, left, right and the cabinets under the board island', () => {
    const next = setCountertopEdge(island(), 0, countertopPresetEdge('seating', V))!;
    // Back side 1 (y = −12), front side 3 (y = 25.5); with the front at the top the −x side (side 4) is on the left.
    expect(countertopSides(next)).toEqual({
      back: 0,
      front: 2,
      left: 3,
      right: 1,
      cabinets: { width: 73.5, depth: 24 },
    });
  });

  it('is null for a top that is not four-sided', () => {
    const tri = piece(
      [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 0, y: 30 },
      ],
      [edge('exposed'), edge('exposed'), edge('exposed')],
    );
    expect(countertopSides(tri)).toBeNull();
  });
});

describe('EZD-414 countertopOutlinesOverlap', () => {
  const r = (x0: number, y0: number, x1: number, y1: number): Point[] => [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
  it('tops that only touch do not overlap; a top run into another does', () => {
    // The traced L: back top 144 × 25 1/2 and its return from y = 25 1/2 (touching along y = 25 1/2).
    expect(countertopOutlinesOverlap(r(0, 0, 144, 25.5), r(0, 25.5, 25.5, 88.5))).toBe(false);
    // The back top's front at 12" (y = 36) runs into the return.
    expect(countertopOutlinesOverlap(r(0, 0, 144, 36), r(0, 25.5, 25.5, 88.5))).toBe(true);
    // One wholly inside another.
    expect(countertopOutlinesOverlap(r(0, 0, 100, 100), r(10, 10, 20, 20))).toBe(true);
    expect(countertopOutlinesOverlap(r(0, 0, 10, 10), r(20, 0, 30, 10))).toBe(false);
  });
});

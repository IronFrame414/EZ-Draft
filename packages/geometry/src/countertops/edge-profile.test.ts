// EZD-417 (AC-EZD-417-1 "An offered total equals rate × exposed LF"; S04b "price per lf × exposed edge length";
// R24 #33; 09f "Edge profile applies to exposed edges only"). Expected numbers are hand counts from board S04b
// (vault/mockups/S04bCountertops.png) as in piece.test.ts: the island 76 1/2 x 37 1/2 has all four sides exposed,
// 2 × (76.5 + 37.5) = 228" = 19 LF; the L top (back wall 141 1/2, left return 63, depth 25 1/2) has exposed
// 116 + 63 + 25.5 = 204.5" = 17 1/24 LF.
import { describe, expect, it } from 'vitest';
import type { CountertopEdge, CountertopEdgeKind, CountertopPieceData, Point } from '../schema';
import { countertopPieceDataSchema } from '../schema';
import {
  countertopPieceProfileId,
  EDGE_PROFILE_KEYS,
  edgeOfferTotal,
  edgeOfferTotalCents,
  withEdgeProfile,
} from './edge-profile';

const LEVEL = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
const P1 = '5b0f6a8e-2f0e-4c55-9a43-0b1d2c3e4f50';
const P2 = '7c1e2d3f-4a5b-4c6d-8e7f-901a2b3c4d5e';
const edge = (kind: CountertopEdgeKind, profileId: string | null = null): CountertopEdge => ({
  kind,
  overhang: kind === 'seating' ? 12 : kind === 'exposed' ? 1.5 : 0,
  backsplashHeight: kind === 'wall' ? 4 : null,
  profileId: kind === 'wall' ? null : profileId,
});
const piece = (outline: Point[], kinds: CountertopEdgeKind[]): CountertopPieceData => ({
  geometry: { outline },
  status: 'new',
  level: LEVEL,
  attributes: { label: 'A', name: '', materialItemId: null, thickness: 1.1811, edges: kinds.map((k) => edge(k)) },
});

const L_TOP = piece(
  [
    { x: 0, y: 0 },
    { x: 141.5, y: 0 },
    { x: 141.5, y: 25.5 },
    { x: 25.5, y: 25.5 },
    { x: 25.5, y: 88.5 },
    { x: 0, y: 88.5 },
  ],
  ['wall', 'wall', 'exposed', 'exposed', 'exposed', 'wall'],
);
const ISLAND = piece(
  [
    { x: 0, y: 0 },
    { x: 76.5, y: 0 },
    { x: 76.5, y: 37.5 },
    { x: 0, y: 37.5 },
  ],
  ['exposed', 'exposed', 'seating', 'exposed'],
);

describe('EZD-417 edge profiles (geometry)', () => {
  it('lists the seven library profiles in spec order', () => {
    expect(EDGE_PROFILE_KEYS).toEqual([
      'eased',
      'bevel',
      'half_bullnose',
      'full_bullnose',
      'ogee',
      'mitered_apron',
      'custom',
    ]);
  });

  it('AC-EZD-417-1 the island total is rate × 19 LF', () => {
    expect(edgeOfferTotal(12, ISLAND)).toBe(228);
    expect(edgeOfferTotal(18.5, ISLAND)).toBe(351.5);
    expect(edgeOfferTotalCents(12, ISLAND)).toBe(22800);
  });

  it('AC-EZD-417-1 the L top total is rate × 17 1/24 LF, wall edges not counted, rounded once to the cent', () => {
    // 10 × 204.5 / 12 = 170.41666… → 170.42
    expect(edgeOfferTotal(10, L_TOP)).toBe(170.42);
    // 12.5 × 204.5 / 12 = 213.0208… → 213.02
    expect(edgeOfferTotal(12.5, L_TOP)).toBe(213.02);
    // 6 × 204.5 / 12 = 102.25 exactly
    expect(edgeOfferTotal(6, L_TOP)).toBe(102.25);
  });

  it('an included profile (rate 0) totals 0', () => {
    expect(edgeOfferTotal(0, ISLAND)).toBe(0);
  });

  it('a half cent rounds up', () => {
    // 0.01 × 1.5 LF (one 18" exposed edge) = 0.015 → 0.02
    const strip = piece(
      [
        { x: 0, y: 0 },
        { x: 18, y: 0 },
        { x: 18, y: 1 },
        { x: 0, y: 1 },
      ],
      ['exposed', 'wall', 'wall', 'wall'],
    );
    expect(edgeOfferTotal(0.01, strip)).toBe(0.02);
  });

  it('applies a profile to exposed edges only, and the result is a valid piece', () => {
    const done = withEdgeProfile(L_TOP, P1);
    expect(done.attributes.edges.map((e) => e.profileId)).toEqual([null, null, P1, P1, P1, null]);
    expect(countertopPieceDataSchema.safeParse(done).success).toBe(true);
    expect(countertopPieceProfileId(done)).toBe(P1);
    expect(countertopPieceProfileId(withEdgeProfile(done, null))).toBeNull();
  });

  it("reads a top's profile only when every exposed edge carries the same one", () => {
    expect(countertopPieceProfileId(ISLAND)).toBeNull();
    const mixed: CountertopPieceData = {
      ...ISLAND,
      attributes: {
        ...ISLAND.attributes,
        edges: [edge('exposed', P1), edge('exposed', P1), edge('seating', P2), edge('exposed', P1)],
      },
    };
    expect(countertopPieceProfileId(mixed)).toBeNull();
    const one: CountertopPieceData = {
      ...mixed,
      attributes: { ...mixed.attributes, edges: mixed.attributes.edges.map((e) => ({ ...e, profileId: P2 })) },
    };
    expect(countertopPieceProfileId(one)).toBe(P2);
  });
});

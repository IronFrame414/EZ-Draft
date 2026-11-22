// EZD-417 (S04b Controls "Edge profile card | Pick profile from library: eased, bevel, half bullnose, full bullnose,
// ogee, mitered apron, custom | Applied to exposed edges only", "Offered profile rows | Display offered profiles
// with the price difference as a total for this top (price per lf × exposed edge length)"; R24 #33 "Edge profile
// price shows as a total"; AC-EZD-417-1 "An offered total equals rate × exposed LF"; vault/build/assumptions.md
// EZD-417): the edge profile of a top and the offered total. The total uses the top's exact exposed length (not the
// whole-foot status bar figure) and is rounded once, to the cent, half up.
import type { CountertopPieceData } from '../schema';
import { countertopExposedEdgeIn, isExposedEdgeKind } from './piece';

// The library, in the order the spec lists it (03c edge_profile; S15e).
export const EDGE_PROFILE_KEYS = [
  'eased',
  'bevel',
  'half_bullnose',
  'full_bullnose',
  'ogee',
  'mitered_apron',
  'custom',
] as const;
export type EdgeProfileKey = (typeof EDGE_PROFILE_KEYS)[number];

const IN_PER_FT = 12;
// A product of cents and inches that lands on a half cent may come out a hair under it.
const HALF_UP_SLACK = 1e-9;

// Rate per LF (dollars, to the cent) × the top's exposed length in feet, in whole cents.
export function edgeOfferTotalCents(ratePerLf: number, piece: CountertopPieceData): number {
  const rateCents = Math.round(ratePerLf * 100);
  return Math.floor((rateCents * countertopExposedEdgeIn(piece)) / IN_PER_FT + 0.5 + HALF_UP_SLACK);
}

// The same total in dollars.
export function edgeOfferTotal(ratePerLf: number, piece: CountertopPieceData): number {
  return edgeOfferTotalCents(ratePerLf, piece) / 100;
}

// The top's edge profile: the one every exposed edge carries, or null when none is set, the exposed edges differ,
// or the top has no exposed edge.
export function countertopPieceProfileId(piece: CountertopPieceData): string | null {
  let found: string | null = null;
  let any = false;
  for (const e of piece.attributes.edges) {
    if (!isExposedEdgeKind(e.kind)) continue;
    if (e.profileId === null) return null;
    if (any && found!.toLowerCase() !== e.profileId.toLowerCase()) return null;
    found = e.profileId;
    any = true;
  }
  return found;
}

// The top with `profileId` on every exposed edge; wall edges keep none (09f "wall edges take backsplash").
export function withEdgeProfile(piece: CountertopPieceData, profileId: string | null): CountertopPieceData {
  return {
    ...piece,
    attributes: {
      ...piece.attributes,
      edges: piece.attributes.edges.map((e) =>
        isExposedEdgeKind(e.kind) ? { ...e, profileId } : { ...e, profileId: null },
      ),
    },
  };
}

// EZD-414 (S04b Controls "Click edge", "Overhang chip on edge | Click to type a value", "Overhang inputs Front / Left /
// Right / Back", "Preset chip ..."; S15d Countertops default overhangs; AC-EZD-414-1; vault/build/assumptions.md
// EZD-414): an edge's overhang as model changes. Pure: no React, no DOM. Each set is one `applyEdit` (one undo step).
import {
  COUNTERTOP_DEFAULT_BACKSPLASH,
  COUNTERTOP_PRESET_FALLBACK,
  countertopEdgeSegment,
  countertopOutlinesOverlap,
  countertopPresetEdge,
  countertopTypedEdge,
  setCountertopEdge,
  withCountertopSupport,
  type CountertopEdgeSetting,
  type CountertopOverhangPreset,
  type CountertopPresetValues,
  type CountertopSupportSettings,
  type Point,
} from '@ezdraft/geometry';
import type { Change } from '../model/patches';
import { sameId } from '../shared/ids';
import { countertopChange, type CountertopPiece } from './trace-tool';

// The preset values from the effective per-project Defaults (S15d "Default overhang: Standard 1 1/2"", "Seating,
// counter height 12"", "Seating, bar 10"", "Against wall 0 + splash"); the spec's numbers while one is not read. A
// Wall + splash edge takes the splash already on the floor's tops (the Material tab's Backsplash height), else 4".
export function countertopPresetValues(
  defaults: Readonly<Record<string, unknown>> | null | undefined,
  pieces: readonly CountertopPiece[],
): CountertopPresetValues {
  const num = (k: string, d: number) => {
    const v = defaults?.[k];
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d;
  };
  let backsplash: number = COUNTERTOP_DEFAULT_BACKSPLASH;
  outer: for (const p of pieces)
    for (const e of p.data.attributes.edges)
      if (e.kind === 'wall' && e.backsplashHeight !== null && e.backsplashHeight > 0) {
        backsplash = e.backsplashHeight;
        break outer;
      }
  return {
    standard: num('overhang_standard', COUNTERTOP_PRESET_FALLBACK.standard),
    bar: num('overhang_seating_bar', COUNTERTOP_PRESET_FALLBACK.bar),
    seating: num('overhang_seating_counter', COUNTERTOP_PRESET_FALLBACK.seating),
    againstWall: num('overhang_against_wall', COUNTERTOP_PRESET_FALLBACK.againstWall),
    backsplash,
  };
}

// EZD-415 (S15d Countertops "Seating overhang support limit"; assumption EZD-415): the support check's Defaults, the
// company limit, bracket spacing and seat width; each null while Not set (or not read).
export function countertopSupportSettings(
  defaults: Readonly<Record<string, unknown>> | null | undefined,
): CountertopSupportSettings {
  const num = (k: string) => {
    const v = defaults?.[k];
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
  };
  return {
    limit: num('seating_support_limit'),
    bracketSpacing: num('countertop_bracket_spacing'),
    seatWidth: num('countertop_seat_width'),
  };
}

// The change that sets edge `edge` of piece `pieceId`; [] when the piece is not shown, nothing changes, or the
// geometry refuses it (a seam, a seam corner, a cutout pushed off, an outline that is not valid, another top in the
// way). With `support` (EZD-415) the piece's support requirement is worked out again in the same change (one undo
// step): set when a seating side is past the limit, removed when none is.
export function countertopEdgeChanges(
  pieces: readonly CountertopPiece[],
  pieceId: string,
  edge: number,
  setting: CountertopEdgeSetting,
  support?: CountertopSupportSettings,
): Change[] {
  const p = pieces.find((q) => sameId(q.id, pieceId));
  if (p === undefined) return [];
  const old = p.data.attributes.edges[edge];
  if (
    old !== undefined &&
    old.kind === setting.kind &&
    old.overhang === setting.overhang &&
    (setting.kind !== 'wall' || old.backsplashHeight === setting.backsplashHeight)
  )
    return [];
  const moved = setCountertopEdge(p.data, edge, setting);
  if (moved === null) return [];
  const next = support === undefined ? moved : withCountertopSupport(moved, support);
  // A moved edge may not run this top into another (an L's back top into its return).
  if (
    next.geometry.outline !== p.data.geometry.outline &&
    pieces.some((q) => q !== p && countertopOutlinesOverlap(next.geometry.outline, q.data.geometry.outline))
  )
    return [];
  return [countertopChange(p.id, next)];
}


export function countertopPresetChanges(
  pieces: readonly CountertopPiece[],
  pieceId: string,
  edge: number,
  preset: CountertopOverhangPreset,
  values: CountertopPresetValues,
  support?: CountertopSupportSettings,
): Change[] {
  return countertopEdgeChanges(pieces, pieceId, edge, countertopPresetEdge(preset, values), support);
}

export function countertopTypedChanges(
  pieces: readonly CountertopPiece[],
  pieceId: string,
  edge: number,
  overhang: number,
  support?: CountertopSupportSettings,
): Change[] {
  const p = pieces.find((q) => sameId(q.id, pieceId));
  const old = p?.data.attributes.edges[edge];
  if (old === undefined) return [];
  return countertopEdgeChanges(pieces, pieceId, edge, countertopTypedEdge(old, overhang), support);
}

// The edge nearest `at` within `radius` (S04b "Click edge | Selects that edge"): the last piece drawn wins a tie, as
// countertopPieceAt. Null when no edge is that close.
export function countertopEdgeAt(
  pieces: readonly CountertopPiece[],
  at: Point,
  radius: number,
): { pieceId: string; edge: number } | null {
  let best: { pieceId: string; edge: number } | null = null;
  let bestD = radius;
  for (let k = pieces.length - 1; k >= 0; k--) {
    const p = pieces[k]!;
    const o = p.data.geometry.outline;
    for (let i = 0; i < o.length; i++) {
      const [a, b] = countertopEdgeSegment(o, i);
      const d = distToSegment(at, a, b);
      if (d < bestD) {
        bestD = d;
        best = { pieceId: p.id, edge: i };
      }
    }
  }
  return best;
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

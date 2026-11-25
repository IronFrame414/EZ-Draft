// EZD-418 (S04b Controls "Top schedule | Inspector footer | Opens schedule: material, thickness, area, edge length";
// 08 Exports "Countertop schedule | On sheets, CSV | Piece, material, thickness, area, edge profile, edge length";
// AC-EZD-418-1; vault/build/assumptions.md EZD-418): one row per countertop piece, in label order. Values are not
// rounded here; the schedule view and its CSV round for display. EZD-720 (countertop sheet) and EZD-1611b (takeoff)
// read the same rows.
import type { CountertopPieceData } from '../schema';
import { countertopExposedEdgeIn, countertopPieceAreaSqIn, isExposedEdgeKind } from './piece';

export type CountertopScheduleRow = {
  label: string;
  name: string;
  materialItemId: string | null;
  // Inches, as stored.
  thickness: number;
  areaSqIn: number;
  // The exposed edge, where the edge profile goes (09f; S04b "Applied to exposed edges only").
  edgeIn: number;
  // The distinct profiles on the exposed edges, in edge order; [] when none is picked.
  profileIds: string[];
};

// A before Z before AA (labels are one or two capital letters).
const byLabel = (a: CountertopScheduleRow, b: CountertopScheduleRow) =>
  a.label.length - b.label.length || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0);

export function countertopScheduleRows(pieces: readonly CountertopPieceData[]): CountertopScheduleRow[] {
  return pieces
    .map((p) => {
      const profileIds: string[] = [];
      for (const e of p.attributes.edges) {
        if (!isExposedEdgeKind(e.kind) || e.profileId === null) continue;
        if (!profileIds.some((id) => id.toLowerCase() === e.profileId!.toLowerCase())) profileIds.push(e.profileId);
      }
      return {
        label: p.attributes.label,
        name: p.attributes.name,
        materialItemId: p.attributes.materialItemId,
        thickness: p.attributes.thickness,
        areaSqIn: countertopPieceAreaSqIn(p),
        edgeIn: countertopExposedEdgeIn(p),
        profileIds,
      };
    })
    .sort(byLabel);
}

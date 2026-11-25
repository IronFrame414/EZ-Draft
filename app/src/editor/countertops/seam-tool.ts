// EZD-413 (S04b Controls "Seam | Canvas tool bar | Click across a piece to split it; seam drawn red dashed | Pieces
// relabel (A, B, C)"; AC-EZD-413-1 "A seam yields two relabeled pieces"; vault/build/assumptions.md EZD-413): the Seam
// tool as model changes. Pure: no React, no DOM. A seam is one `applyEdit` (one undo step): the split piece keeps its
// id as the larger part, the smaller part is a new piece, and every piece on the floor is lettered again A, B, C …
// in label order with the two parts side by side.
import {
  countertopLabelRank,
  relabelCountertops,
  seamChordAt,
  splitCountertopPiece,
  withCountertopSupport,
  type CountertopPieceData,
  type CountertopSupportSettings,
  type ModelObject,
  type Point,
  type SeamChord,
} from '@ezdraft/geometry';
import type { Change } from '../model/patches';
import { countertopChange, countertopPieceAt, countertopPieces } from './trace-tool';

// The seam a click at `at` would make on the piece under it (drawn while the pointer moves); null off every piece.
export function seamPreviewAt(
  objects: readonly ModelObject[],
  level: string | null,
  at: Point,
  increment: number | null,
): { pieceId: string; chord: SeamChord } | null {
  if (level === null) return null;
  const pieces = countertopPieces(objects, level);
  const id = countertopPieceAt(pieces, at);
  const piece = pieces.find((p) => p.id === id);
  if (piece === undefined) return null;
  const chord = seamChordAt(piece.data.geometry.outline, at, increment);
  if (chord === null || splitCountertopPiece(piece.data, chord, SEAM_PREVIEW_ID) === null) return null;
  return { pieceId: piece.id, chord };
}

const SEAM_PREVIEW_ID = '00000000-0000-4000-8000-000000000000';

// A seam clicked at `at`: the changes and the ids of the two pieces it makes (larger first). No changes when the
// click is off every piece or the seam would not cut the piece in two (or would run through a cutout). With `support`
// (EZD-415) each part's seating support requirement is worked out again for its own sides.
export function countertopSeamChanges(
  objects: readonly ModelObject[],
  level: string | null,
  at: Point,
  increment: number | null,
  newId: () => string,
  support?: CountertopSupportSettings,
): { changes: Change[]; ids: [string, string] | null } {
  const none = { changes: [], ids: null };
  const preview = seamPreviewAt(objects, level, at, increment);
  if (preview === null || level === null) return none;
  const pieces = countertopPieces(objects, level);
  const target = pieces.find((p) => p.id === preview.pieceId)!;
  const split = splitCountertopPiece(target.data, preview.chord, newId());
  if (split === null) return none;
  const otherId = newId();

  // Label order, model order between equal labels; the split piece's two parts take its place.
  const ranked = pieces
    .map((p, i) => ({ p, i, r: countertopLabelRank(p.data.attributes.label) }))
    .sort((x, y) => x.r - y.r || x.i - y.i);
  const data = new Map<string, CountertopPieceData>();
  const order: string[] = [];
  for (const { p } of ranked) {
    if (p.id === target.id) {
      order.push(target.id, otherId);
      const part = (d: CountertopPieceData) => (support === undefined ? d : withCountertopSupport(d, support));
      data.set(target.id, part(split[0]));
      data.set(otherId, part(split[1]));
    } else {
      order.push(p.id);
      data.set(p.id, p.data);
    }
  }
  const labels = relabelCountertops(order);
  const changes: Change[] = [];
  for (const id of order) {
    const d = data.get(id)!;
    const label = labels.get(id)!;
    const changed = id === target.id || id === otherId || d.attributes.label !== label;
    if (changed) changes.push(countertopChange(id, { ...d, attributes: { ...d.attributes, label } }));
  }
  return { changes, ids: [target.id, otherId] };
}

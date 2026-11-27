// EZD-232 (S03 rail "Revision cloud | Draw a cloud and delta tag manually"; 09h "Changed objects get clouds and a delta
// tag"; symbol key "Revision cloud + delta"): the drawing items of a stored revision cloud. Pure.
//
// The cloud is a row of half-circle scallops along each side of its outline, bulging outward; each side gets a whole
// number of scallops as near REVISION_SCALLOP_PAPER_IN across as fits. The delta tag is an equilateral triangle
// REVISION_DELTA_PAPER_IN on a side, centred on the tag point, with the revision number inside at the note size; a
// cloud whose revision is not yet numbered shows an empty triangle. Sizes are paper inches, so a cloud prints the
// same at any scale (vault/build/assumptions/EZD-232.md). Everything is on the `dimensions` layer.
import { DRAWING_FONTS, measureTextPt } from './text';
import type { DrawingItem } from './types';
import { NOTE_PAPER_SIZE, PAPER_SIZE_IN, type Point, type RevisionCloudData } from '../schema';
import type { AnnotationScale } from '../dimensions/items';

export type RevisionCloudObject = { id: string; type: 'revision_cloud'; data: RevisionCloudData };

/** A scallop's width across, paper inches. */
export const REVISION_SCALLOP_PAPER_IN = 3 / 8;
/** The delta triangle's side, paper inches. */
export const REVISION_DELTA_PAPER_IN = 3 / 8;

const FONT = 'dm-mono-400' as const;

/** Model inches per paper inch at this annotation scale. */
export const modelInPerPaperIn = (s: AnnotationScale): number => s.paperPtPerIn * s.modelInPerPt;

// Twice the signed area: positive when the outline runs counter-clockwise.
function signedArea2(pts: readonly Point[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a;
}

const deg = (v: Point): number => {
  const d = (Math.atan2(v.y, v.x) * 180) / Math.PI;
  return d < 0 ? d + 360 : d;
};

/** The scallops along a closed outline, `chord` model inches across at most rounding; each bulges outward. */
export function cloudScallops(
  boundary: readonly Point[],
  chord: number,
): { center: Point; radius: number; startAngle: number; endAngle: number }[] {
  const ccw = signedArea2(boundary) >= 0;
  const out: { center: Point; radius: number; startAngle: number; endAngle: number }[] = [];
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i]!;
    const b = boundary[(i + 1) % boundary.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    const n = Math.max(1, Math.round(len / chord));
    const ux = (b.x - a.x) / n;
    const uy = (b.y - a.y) / n;
    for (let k = 0; k < n; k++) {
      const from = { x: a.x + ux * k, y: a.y + uy * k };
      const to = { x: a.x + ux * (k + 1), y: a.y + uy * (k + 1) };
      const center = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      // Counter-clockwise from the start end, a half turn sweeps the right-hand side of a counter-clockwise outline
      // (its outside); a clockwise outline starts from the far end instead.
      const start = ccw ? from : to;
      const startAngle = deg({ x: start.x - center.x, y: start.y - center.y });
      out.push({ center, radius: len / n / 2, startAngle, endAngle: startAngle + 180 });
    }
  }
  return out;
}

/** The delta triangle's corners: equilateral, point up, centred on `at`. */
export function deltaCorners(at: Point, side: number): [Point, Point, Point] {
  const r = side / Math.sqrt(3);
  const c = (a: number): Point => ({
    x: at.x + r * Math.cos((a * Math.PI) / 180),
    y: at.y + r * Math.sin((a * Math.PI) / 180),
  });
  return [c(90), c(210), c(330)];
}

export function revisionCloudItems(o: RevisionCloudObject, scale: AnnotationScale): DrawingItem[] {
  const perPaper = modelInPerPaperIn(scale);
  const base = { layer: 'dimensions' as const, objectId: o.id, role: 'dimension' as const };
  const out: DrawingItem[] = cloudScallops(
    o.data.geometry.boundary,
    REVISION_SCALLOP_PAPER_IN * perPaper,
  ).map((s) => ({ kind: 'arc', ...base, ...s }));
  const tri = deltaCorners(o.data.geometry.tag, REVISION_DELTA_PAPER_IN * perPaper);
  for (let i = 0; i < 3; i++)
    out.push({ kind: 'line', ...base, from: tri[i]!, to: tri[(i + 1) % 3]! });
  const rev = o.data.attributes.rev;
  if (rev !== null) {
    const text = String(rev);
    const sizePt = PAPER_SIZE_IN[NOTE_PAPER_SIZE] * scale.paperPtPerIn;
    out.push({
      kind: 'text',
      layer: 'dimensions',
      objectId: o.id,
      text,
      font: FONT,
      sizePt,
      widthPt: measureTextPt(DRAWING_FONTS[FONT], text, sizePt),
      at: o.data.geometry.tag,
      rotationDeg: 0,
      align: 'center',
    });
  }
  return out;
}

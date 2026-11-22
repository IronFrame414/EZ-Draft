// EZD-915 (S12 Supplier PDF import "Vector PDF parsed for walls, cabinet runs, dims; cabinet labels set size and type;
// plan and elevations cross-checked; result goes to Import review with confidence colors. Scanned PDF: trace-assist
// only, lower confidence"; S02 States "Supplier kitchen PDF: cabinet labels read (W3030, B24) and plan vs elevation
// cross-check results shown per cabinet"; vault/build/assumptions.md EZD-915): what a supplier kitchen PDF gives
// Import review. Page 1 is the plan and every later page an elevation. On the plan:
// - walls are read as any PDF drawing's (pdf-walls/detect: the heaviest line weight, the PDF default scale);
// - each text that is a cabinet code (codes.ts) is one cabinet; its type and size come from the code. Its outline is
//   the nearest stroked edge on each side of the label (left, right, below, above), so a box drawn around its code;
// - cabinets whose outlines touch (within the 1/2" tolerance) are one run.
// Cross-check: the plan outline should read the label's width by depth (either way round) and the elevation box of
// the same code (the n-th of that code on the elevations for the n-th on the plan, each in reading order) its width
// by height. Confidence: both agree, 95 (high, Accept N); no elevation box for it, 70; a view that reads another size
// or a plan label with no outline, 50 (both below the default cutoff of 80, so To check). A scanned page (no
// strokes, no text) gives nothing, so Import review shows Nothing detected and the plan is traced. Dimension strings
// are not read: sizes come from the codes (S12 Validation "sizes come from codes or order report"). Pure. Model inches.
import type { PdfPoint, ScaleCalibration } from '../../../lib/imports/scale-calibration';
import { planPointOf } from '../../../lib/imports/scale-calibration';
import type { CabinetViewCheck, Pt, ReviewCabinet } from '../../../lib/imports/review';
import { DEFAULT_PDF_SCALE, detectPdfWalls, PDF_WALL_LAYER } from '../pdf-walls/detect';
import type { PdfPageRead, PdfSegment } from '../pdf-walls/read-pdf';
import type { Detection } from '../polycam-dxf/detect';
import { parseCabinetCode, type CabinetLabel } from './codes';

/** Plan and elevation sizes agree with a label within this many inches (S02 mockup tolerance 1/2"). */
export const SUPPLIER_CHECK_TOLERANCE_IN = 0.5;

export const CONFIDENCE_AGREES = 95;
export const CONFIDENCE_NO_ELEVATION = 70;
export const CONFIDENCE_DIFFERS = 50;

/** A stroke is axis-aligned when its ends differ by at most this much across (page points). */
const AXIS_EPS_PT = 0.01;

export type SupplierDetection = Detection & { cabinets: ReviewCabinet[] };

type Box = { left: number; right: number; bottom: number; top: number };
type Found = { label: CabinetLabel; at: PdfPoint; box: Box | null };

/**
 * The box around a point: the nearest vertical stroke on each side whose span covers the point's height, and the
 * nearest horizontal stroke below and above whose span covers its x. Null when a side has none.
 */
export function boxAround(segments: readonly PdfSegment[], at: PdfPoint): Box | null {
  const [x, y] = at;
  let left = -Infinity;
  let right = Infinity;
  let bottom = -Infinity;
  let top = Infinity;
  const covers = (p: number, a: number, b: number) => p >= Math.min(a, b) && p <= Math.max(a, b);
  for (const s of segments) {
    const [ax, ay] = s.a;
    const [bx, by] = s.b;
    if (Math.abs(ax - bx) <= AXIS_EPS_PT && covers(y, ay, by)) {
      const sx = (ax + bx) / 2;
      if (sx < x && sx > left) left = sx;
      if (sx > x && sx < right) right = sx;
    } else if (Math.abs(ay - by) <= AXIS_EPS_PT && covers(x, ax, bx)) {
      const sy = (ay + by) / 2;
      if (sy < y && sy > bottom) bottom = sy;
      if (sy > y && sy < top) top = sy;
    }
  }
  if (![left, right, bottom, top].every(Number.isFinite)) return null;
  return { left, right, bottom, top };
}

function labelsOn(page: PdfPageRead): Found[] {
  const found: Found[] = [];
  for (const text of page.texts) {
    const label = parseCabinetCode(text.str);
    if (label) found.push({ label, at: text.at, box: boxAround(page.segments, text.at) });
  }
  // Reading order: top to bottom, then left to right (page y is up).
  return found.sort((a, b) => b.at[1] - a.at[1] || a.at[0] - b.at[0]);
}

const near = (a: number, b: number) => Math.abs(a - b) <= SUPPLIER_CHECK_TOLERANCE_IN;

export function detectSupplierPdf(
  pages: readonly PdfPageRead[],
  options: { toleranceIn?: number } = {},
): SupplierDetection {
  const plan = pages[0];
  if (!plan) {
    const layers = { walls: [PDF_WALL_LAYER], doors: [], windows: [], rooms: [] };
    return { walls: [], openings: [], rooms: [], layers, cabinets: [] };
  }
  const walls = detectPdfWalls(plan, null, options);
  const cal: ScaleCalibration = { page: plan.pageNumber, ...DEFAULT_PDF_SCALE };
  const inPerPt = cal.lengthIn / Math.hypot(cal.b[0] - cal.a[0], cal.b[1] - cal.a[1]);
  const at = (p: PdfPoint): Pt => planPointOf(cal, { scale: 1, toImage: plan.toImage }, p);

  // The elevation boxes of each code, in page then reading order; each plan label takes the next one of its code.
  const elevations = new Map<string, Found[]>();
  for (const page of pages.slice(1)) {
    for (const f of labelsOn(page)) {
      const list = elevations.get(f.label.code) ?? [];
      list.push(f);
      elevations.set(f.label.code, list);
    }
  }

  const cabinets: ReviewCabinet[] = labelsOn(plan).map((f, i) => {
    const { label } = f;
    let outline: ReviewCabinet['outline'] = null;
    let planSize: ReviewCabinet['check']['planSize'] = null;
    let planCheck: CabinetViewCheck = 'missing';
    let center = at(f.at);
    if (f.box) {
      const a = at([f.box.left, f.box.bottom]);
      const b = at([f.box.right, f.box.top]);
      outline = {
        min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
        max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
      };
      center = { x: (outline.min.x + outline.max.x) / 2, y: (outline.min.y + outline.max.y) / 2 };
      const w = outline.max.x - outline.min.x;
      const h = outline.max.y - outline.min.y;
      planSize = { long: Math.max(w, h), short: Math.min(w, h) };
      const agrees =
        (near(w, label.width) && near(h, label.depth)) || (near(h, label.width) && near(w, label.depth));
      planCheck = agrees ? 'agrees' : 'differs';
    }

    const elev = elevations.get(label.code)?.shift();
    let elevationSize: ReviewCabinet['check']['elevationSize'] = null;
    let elevationCheck: CabinetViewCheck = 'missing';
    if (elev?.box) {
      const width = (elev.box.right - elev.box.left) * inPerPt;
      const height = (elev.box.top - elev.box.bottom) * inPerPt;
      elevationSize = { width, height };
      elevationCheck = near(width, label.width) && near(height, label.height) ? 'agrees' : 'differs';
    }

    const confidence =
      planCheck === 'agrees' && elevationCheck === 'agrees'
        ? CONFIDENCE_AGREES
        : planCheck === 'agrees' && elevationCheck === 'missing'
          ? CONFIDENCE_NO_ELEVATION
          : CONFIDENCE_DIFFERS;
    return {
      id: `cabinet-${i + 1}`,
      type: 'cabinet',
      number: i + 1,
      confidence,
      code: label.code,
      boxType: label.boxType,
      width: label.width,
      depth: label.depth,
      height: label.height,
      center,
      outline,
      run: 0,
      check: { plan: planCheck, elevation: elevationCheck, planSize, elevationSize },
    };
  });

  return { ...walls, cabinets: numberRuns(cabinets) };
}

/** Cabinets whose outlines touch or overlap (within the tolerance) share a run, numbered in cabinet order. */
export function numberRuns(cabinets: ReviewCabinet[]): ReviewCabinet[] {
  const parent = cabinets.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const t = SUPPLIER_CHECK_TOLERANCE_IN;
  for (let i = 0; i < cabinets.length; i += 1) {
    for (let j = i + 1; j < cabinets.length; j += 1) {
      const a = cabinets[i].outline;
      const b = cabinets[j].outline;
      if (!a || !b) continue;
      const touch =
        a.min.x <= b.max.x + t && b.min.x <= a.max.x + t && a.min.y <= b.max.y + t && b.min.y <= a.max.y + t;
      if (touch) parent[root(j)] = root(i);
    }
  }
  const runOf = new Map<number, number>();
  return cabinets.map((c, i) => {
    const r = root(i);
    if (!runOf.has(r)) runOf.set(r, runOf.size + 1);
    return { ...c, run: runOf.get(r)! };
  });
}

// EZD-305 (S01 PDF: detect type "Vector PDF: auto-detect walls. Scanned PDF: trace-only"; S02 States Empty "no items
// detected (e.g. scanned PDF)"): turns the stroked lines of one PDF page into detected walls. A PDF has no layers,
// so the wall lines are the page's heaviest line weight: every straight stroke at least WALL_WEIGHT_SHARE of the
// widest one (plans draw walls with the heaviest pen; vault/build/assumptions.md EZD-305). They are placed in the
// plan as EZD-304's underlay is (planPointOf: the first calibration point at the origin, page right east, page up
// north) and handed to EZD-302's wall detector as one wall layer, so pairing faces, joining ends and confidence are
// the DXF import's. Openings, rooms and cabinet labels are not read here. A page with no strokes, such as a scanned
// page (one image), gives no items. Pure: no database, no Storage. Model inches (03 rule 5).
import {
  planPointOf,
  type PdfPoint,
  type ScaleCalibration,
} from '../../../lib/imports/scale-calibration';
import { detectPolycamDxf, type Detection, type LayerMap } from '../polycam-dxf/detect';
import type { DxfDrawing, DxfLine } from '../polycam-dxf/read-dxf';
import type { PdfPageRead } from './read-pdf';

export const PDF_WALL_LAYER = 'PDF walls';

/** A stroke is a wall line when its width is at least this share of the page's widest stroke. */
export const WALL_WEIGHT_SHARE = 0.75;

/**
 * The scale used when the PDF has none yet (Q-0203: no known scale never blocks): 09 Sheet set rules' plan scale,
 * 1/4" = 1'-0", that is 48 in per 72 pt, measured from the page origin.
 */
export const DEFAULT_PDF_SCALE: Omit<ScaleCalibration, 'page'> = {
  a: [0, 0],
  b: [72, 0],
  lengthIn: 48,
};

const WALL_LAYERS: LayerMap = { walls: [PDF_WALL_LAYER], doors: [], windows: [], rooms: [] };

export function wallSegments(read: Pick<PdfPageRead, 'segments'>): PdfPageRead['segments'] {
  if (read.segments.length === 0) return [];
  // A loop, not Math.max(...): a dense page has more segments than a call takes arguments.
  let widest = 0;
  for (const s of read.segments) if (s.width > widest) widest = s.width;
  return read.segments.filter((s) => s.width >= widest * WALL_WEIGHT_SHARE);
}

export function detectPdfWalls(
  read: PdfPageRead,
  calibration: ScaleCalibration | null,
  options: { toleranceIn?: number } = {},
): Detection {
  const cal: ScaleCalibration = calibration ?? { page: read.pageNumber, ...DEFAULT_PDF_SCALE };
  const view = { scale: 1, toImage: read.toImage };
  const at = (p: PdfPoint) => planPointOf(cal, view, p);
  const lines: DxfLine[] = wallSegments(read).map((s) => ({
    layer: PDF_WALL_LAYER,
    a: at(s.a),
    b: at(s.b),
  }));
  const drawing: DxfDrawing = {
    layers: [PDF_WALL_LAYER],
    lines,
    arcs: [],
    polylines: [],
    skipped: {},
  };
  return detectPolycamDxf(drawing, { layerMap: WALL_LAYERS, toleranceIn: options.toleranceIn });
}

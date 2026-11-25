// EZD-304 (S01 PDF: scale calibration "Click two points on the page, type the real distance | Required before
// tracing. Stored in source_file.scale_calibration"; W2 step 1; Q-0203 a PDF with no known scale never blocks):
// the stored calibration of one PDF page and what it measures. Points are PDF page points (user space, y up), so the
// value does not depend on the size the page was drawn at. Pure TypeScript: no DOM, no pdf.js.
import { MAX_WALL_LENGTH_IN, parseLength, type ParseLengthResult } from '@ezdraft/geometry';
import * as z from 'zod/mini';

export type PdfPoint = readonly [number, number];

export type ScaleCalibration = {
  /** The calibrated page, 1-based. v1 calibrates and shows page 1 (vault/build/assumptions.md EZD-304). */
  page: number;
  a: PdfPoint;
  b: PdfPoint;
  /** The real distance between a and b, in inches as typed. */
  lengthIn: number;
};

/** A PDF page is at most 200 in (14 400 pt) on a side (PDF 1.7 Annex C); a point well outside is not on a page. */
const MAX_PT = 14_400 * 2;
/** The two points must be at least 1 pt apart (vault/build/assumptions.md EZD-304). */
export const MIN_CALIBRATION_PT = 1;

const coord = z.number().check(z.gte(-MAX_PT), z.lte(MAX_PT));
const point = z.tuple([coord, coord]);

export const scaleCalibrationSchema = z
  .strictObject({
    page: z.int().check(z.gte(1), z.lte(10_000)),
    a: point,
    b: point,
    // As parseCalibrationLength gives it: over 0, at most 200 ft, in 1/16 in steps.
    lengthIn: z.number().check(
      z.gt(0),
      z.lte(MAX_WALL_LENGTH_IN),
      z.refine((v) => Number.isInteger(v * 16)),
    ),
  })
  .check(z.refine((v) => pointDistance(v.a, v.b) >= MIN_CALIBRATION_PT));

export function pointDistance(p: PdfPoint, q: PdfPoint): number {
  return Math.hypot(q[0] - p[0], q[1] - p[1]);
}

/** Real inches per PDF point. */
export function inchesPerPoint(cal: ScaleCalibration): number {
  return cal.lengthIn / pointDistance(cal.a, cal.b);
}

/** The real length, in inches, between two points of the calibrated page. */
export function measureIn(cal: ScaleCalibration, p: PdfPoint, q: PdfPoint): number {
  return pointDistance(p, q) * inchesPerPoint(cal);
}

/** The typed real distance: a wall or room length (03g; EZD-201), so 0 and over 200 ft are refused. */
export function parseCalibrationLength(text: string): ParseLengthResult {
  return parseLength(text, 'wall_room');
}

export function calibrationOf(
  page: number,
  a: PdfPoint,
  b: PdfPoint,
  lengthIn: number,
): ScaleCalibration | null {
  const parsed = scaleCalibrationSchema.safeParse({ page, a: [...a], b: [...b], lengthIn });
  return parsed.success ? (parsed.data as ScaleCalibration) : null;
}

/** A stored value read back; anything that is not a calibration is null (no scale yet). */
export function readCalibration(value: unknown): ScaleCalibration | null {
  const parsed = scaleCalibrationSchema.safeParse(value);
  return parsed.success ? (parsed.data as ScaleCalibration) : null;
}

/**
 * The page as the user saw it: the drawn image at `scale` image pixels per page point, and `toImage` from a page
 * point to its image pixel (from the top-left; a pdf.js viewport's convertToViewportPoint, which applies the page's
 * /Rotate and box origin).
 */
export type PageView = {
  scale: number;
  toImage: (p: PdfPoint) => { x: number; y: number };
};

/**
 * The plan position of a page point, oriented as the page was shown: the first calibration point sits at the plan
 * origin, image right is east and image up is north, and one page point is inchesPerPoint plan inches
 * (vault/build/assumptions.md EZD-304 underlay placement). Distances in user space and on the image differ only by
 * `scale`, so lengths are the same for any rotation.
 */
export function planPointOf(
  cal: ScaleCalibration,
  view: PageView,
  p: PdfPoint,
): { x: number; y: number } {
  const a = view.toImage(cal.a);
  return planPixelOf(cal, view, a, view.toImage(p));
}

function planPixelOf(
  cal: ScaleCalibration,
  view: PageView,
  a: { x: number; y: number },
  px: { x: number; y: number },
): { x: number; y: number } {
  const k = inchesPerPoint(cal) / view.scale;
  return { x: (px.x - a.x) * k, y: -(px.y - a.y) * k };
}

export type UnderlayQuad = {
  /** Plan positions of the drawn image's corners: top-left, top-right, bottom-right, bottom-left. */
  corners: readonly [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
  ];
};

/** Where a drawn page image lies in the plan: upright, as it was shown in the set-scale step. */
export function underlayQuad(
  cal: ScaleCalibration,
  view: PageView,
  image: { width: number; height: number },
): UnderlayQuad {
  const a = view.toImage(cal.a);
  const at = (x: number, y: number) => planPixelOf(cal, view, a, { x, y });
  return {
    corners: [at(0, 0), at(image.width, 0), at(image.width, image.height), at(0, image.height)],
  };
}

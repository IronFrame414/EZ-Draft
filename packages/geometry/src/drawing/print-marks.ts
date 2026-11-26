// EZD-705 (S13 Validation "Every sheet gets a scale bar and a printed check dimension"; 09h Sheet set rules "Text
// prints at fixed paper sizes at any scale: minimum 3/32\" on 24×36; labels and dims one size up from notes", "NTS
// details stamped \"NTS\""; AC-EZD-705-1): the print marks of one viewport, in paper inches with y down. Each scaled
// viewport gets a 0 to 8 ft scale bar and a 4'-0" check dimension drawn at the viewport's scale
// (vault/build/assumptions/EZD-705.md); a not-to-scale viewport is stamped NTS instead. The geometry is kept apart
// from the SVG so the PDF job (EZD-715) can draw the same marks. No DOM.
import { SHEET_PEN_IN, SHEET_TEXT_MIN_PT, escapeXml, type SheetArea } from './sheet-svg';

// The strip at the bottom of a viewport's area that holds its print marks; the drawing sits above it.
export const PRINT_MARK_BAND_IN = 0.75;
// 09h: notes print at 3/32" at least (SHEET_TEXT_MIN_PT); labels and dimensions one size up, 1/8".
export const SHEET_NOTE_PT = SHEET_TEXT_MIN_PT;
export const SHEET_DIMENSION_PT = (1 / 8) * 72;
// The settled lengths (model inches): a 0 to 8 ft scale bar and a 4'-0" check dimension. When a large scale makes them
// too wide for the viewport, the next shorter pair that fits is used.
export const SCALE_BAR_IN = 96;
export const CHECK_DIMENSION_IN = 48;
const LENGTHS: readonly { bar: number; check: number }[] = [
  { bar: 96, check: 48 },
  { bar: 48, check: 24 },
  { bar: 24, check: 12 },
  { bar: 12, check: 6 },
];
const SCALE_BAR_SEGMENTS = 4;
const SCALE_BAR_HEIGHT_IN = 1 / 16;
const PAD_IN = 0.25;
const GAP_IN = 0.75;
// Dimension end ticks: half as long as 4/7 of the text size each side (as the plan's dimensions, EZD-216).
const TICK_HALF_IN = ((4 / 7) * SHEET_DIMENSION_PT) / 72;
const EXTENSION_IN = 0.1;

// A length in feet and inches with a dash, as drafted on a sheet: 48 -> 4'-0", 6 -> 0'-6".
export function checkDimensionLabel(inches: number): string {
  const feet = Math.floor(inches / 12);
  return `${feet}'-${Math.round(inches - feet * 12)}"`;
}

export type PaperPoint = { x: number; y: number };
export type PrintMarks =
  | {
      kind: 'scaled';
      band: SheetArea;
      scaleBar: {
        lengthIn: number;
        segments: { x: number; y: number; width: number; height: number; filled: boolean }[];
        labels: { at: PaperPoint; text: string }[];
      };
      check: {
        lengthIn: number;
        from: PaperPoint;
        to: PaperPoint;
        label: string;
        labelAt: PaperPoint;
        caption: string;
        captionAt: PaperPoint;
      };
    }
  | { kind: 'nts'; band: SheetArea; label: string; labelAt: PaperPoint };

// The band of `area` the marks take, and the area left for the drawing above it.
export function splitPrintMarkBand(area: SheetArea): { drawing: SheetArea; band: SheetArea } {
  const h = Math.min(PRINT_MARK_BAND_IN, area.height);
  return {
    drawing: { x: area.x, y: area.y, width: area.width, height: area.height - h },
    band: { x: area.x, y: area.y + area.height - h, width: area.width, height: h },
  };
}

// The marks of a viewport drawn at `scale` paper inches per model inch (null: not to scale) in `area`.
export function printMarks(scale: number | null, area: SheetArea): PrintMarks {
  const { band } = splitPrintMarkBand(area);
  const x0 = band.x + PAD_IN;
  if (scale === null)
    return { kind: 'nts', band, label: 'NTS', labelAt: { x: x0, y: band.y + band.height / 2 } };
  const fits = (l: { bar: number; check: number }) =>
    2 * PAD_IN + (l.bar + l.check) * scale + GAP_IN <= band.width;
  const lengths = LENGTHS.find(fits) ?? LENGTHS[LENGTHS.length - 1]!;

  const barY = band.y + 0.2;
  const barW = lengths.bar * scale;
  const segW = barW / SCALE_BAR_SEGMENTS;
  const segments = Array.from({ length: SCALE_BAR_SEGMENTS }, (_, i) => ({
    x: x0 + i * segW,
    y: barY,
    width: segW,
    height: SCALE_BAR_HEIGHT_IN,
    filled: i % 2 === 0,
  }));
  const labelY = barY + SCALE_BAR_HEIGHT_IN + 0.12;
  const feet = (inches: number) => (inches === 0 ? '0' : `${inches / 12}'`);
  const labels = [0, lengths.bar / 2, lengths.bar].map((inches) => ({
    at: { x: x0 + inches * scale, y: labelY },
    text: feet(inches),
  }));

  const cx0 = x0 + barW + GAP_IN;
  const cy = band.y + 0.35;
  const checkW = lengths.check * scale;
  return {
    kind: 'scaled',
    band,
    scaleBar: { lengthIn: lengths.bar, segments, labels },
    check: {
      lengthIn: lengths.check,
      from: { x: cx0, y: cy },
      to: { x: cx0 + checkW, y: cy },
      label: checkDimensionLabel(lengths.check),
      labelAt: { x: cx0 + checkW / 2, y: cy - 0.04 },
      caption: 'CHECK DIMENSION',
      captionAt: { x: cx0 + checkW / 2, y: cy + 0.2 },
    },
  };
}

const num = (n: number): string => {
  const r = Math.round(n * 1e5) / 1e5;
  return Object.is(r, -0) ? '0' : String(r);
};
const INK = '#000000';
const MONO = `font-family="'DM Mono', monospace"`;
const PEN = num(SHEET_PEN_IN.dimension);

function text(at: PaperPoint, value: string, pt: number, mark: string, anchor: string, baseline: string): string {
  return `<text x="${num(at.x)}" y="${num(at.y)}" ${MONO} font-size="${num(pt / 72)}" text-anchor="${anchor}" dominant-baseline="${baseline}" fill="${INK}" data-print-mark="${mark}">${escapeXml(value)}</text>`;
}

function line(a: PaperPoint, b: PaperPoint, mark: string): string {
  return `<line x1="${num(a.x)}" y1="${num(a.y)}" x2="${num(b.x)}" y2="${num(b.y)}" fill="none" stroke="${INK}" stroke-width="${PEN}" stroke-linecap="round" data-print-mark="${mark}"/>`;
}

// The marks as SVG elements in paper inches; none carries an object id, so they never count as shown objects.
export function printMarksSvg(marks: PrintMarks): string {
  if (marks.kind === 'nts') return text(marks.labelAt, marks.label, SHEET_DIMENSION_PT, 'nts', 'start', 'central');
  const out: string[] = [];
  for (const s of marks.scaleBar.segments)
    out.push(
      `<rect x="${num(s.x)}" y="${num(s.y)}" width="${num(s.width)}" height="${num(s.height)}" fill="${s.filled ? INK : '#ffffff'}" stroke="${INK}" stroke-width="${PEN}" data-print-mark="scale-bar"/>`,
    );
  for (const l of marks.scaleBar.labels)
    out.push(text(l.at, l.text, SHEET_NOTE_PT, 'scale-bar-label', 'middle', 'central'));
  const c = marks.check;
  out.push(line(c.from, c.to, 'check-dimension'));
  for (const end of [c.from, c.to]) {
    out.push(
      line({ x: end.x, y: end.y - EXTENSION_IN }, { x: end.x, y: end.y + EXTENSION_IN }, 'check-dimension-extension'),
    );
    out.push(
      line(
        { x: end.x - TICK_HALF_IN * Math.SQRT1_2, y: end.y + TICK_HALF_IN * Math.SQRT1_2 },
        { x: end.x + TICK_HALF_IN * Math.SQRT1_2, y: end.y - TICK_HALF_IN * Math.SQRT1_2 },
        'check-dimension-tick',
      ),
    );
  }
  out.push(text(c.labelAt, c.label, SHEET_DIMENSION_PT, 'check-dimension-label', 'middle', 'text-after-edge'));
  out.push(text(c.captionAt, c.caption, SHEET_NOTE_PT, 'check-dimension-caption', 'middle', 'central'));
  return out.join('');
}

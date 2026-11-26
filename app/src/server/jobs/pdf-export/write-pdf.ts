// EZD-715 (08 Exports "Permit set": one vector PDF per set, true scale, 24x36 (ARCH D) or 11x17, one bookmark per
// sheet, blank stamp area, not password-locked, markup allowed, scale bar and check dimension on each sheet; S13
// Validation "Every sheet gets a scale bar and a printed check dimension", "Text and symbols print at fixed paper size
// at any scale"; 02 PDF out; R26 R7 one drawing list feeds the plan, the sheet and the PDF; EZD-028 spike): the PDF
// writer. Pages in, bytes out; no database, no Storage. PDFKit is imported only under app/src/server/jobs/.
//
// Each page is one sheet: the border, the title block column with its blank seal box and department approval stamp
// area (permit sets), the sheet number and title, and each plan viewport's drawing list drawn straight from its items
// at the viewport's scale, centred in its area above the print mark strip, with the scale bar and check dimension (or
// NTS) of packages/geometry drawing/print-marks.ts. The placement, pens, poché and text sizes are the sheet preview's
// (sheet-svg.ts), so the PDF and the screen match. Paper inches x 72 = PDF points; PDFKit's space is top-left, y down,
// as the sheet's paper inches are.
//
// Each drawing is wrapped in a marked-content sequence (/EZ_<part> BMC … EMC, the EZD-028 carry-over) so tests find
// the check dimension without relying on draw order. No encryption is written, so the file opens without a password
// and Bluebeam and Acrobat may mark it up and stamp it.
import { readFileSync } from 'node:fs';
import PDFDocument from 'pdfkit';
import {
  SHEET_DIMENSION_PT,
  SHEET_HIDDEN_DASH_IN,
  SHEET_NOTE_PT,
  SHEET_PEN_IN,
  SHEET_TEXT_MIN_PT,
  drawingListBounds,
  printMarks,
  splitPrintMarkBand,
  titleBlockLayout,
  type DrawingItem,
  type DrawingLayer,
  type DrawingList,
  type LineWeightRole,
  type PrintMarks,
  type SheetArea,
  type SheetSize,
} from '@ezdraft/geometry';
import type { Point } from '@ezdraft/geometry';
import { paperInches, sheetFrame } from '../../../lib/sheets/sheet-set';
import { ntsScale } from '../../../workers/sheet-job';

export const PT_PER_IN = 72;

// The PDF page of a set size in points, landscape: 24x36 is 2592 x 1728 pt, 11x17 is 1224 x 792 pt
// (vault/build/assumptions/EZD-715.md).
export function pagePoints(size: SheetSize): { width: number; height: number } {
  const { width, height } = paperInches(size);
  return { width: width * PT_PER_IN, height: height * PT_PER_IN };
}

export type PdfViewport = {
  list: DrawingList;
  // Paper inches per model inch; null is not to scale (fitted to the area and stamped NTS).
  scale: number | null;
  // The viewport's whole area in paper inches (y down), the print mark strip included.
  area: SheetArea;
  // EZD-707: false for a table (the cabinet schedule): drawn in its whole area with no scale bar or check dimension.
  marks?: false;
};

export type PdfSheet = {
  number: string;
  title: string;
  // The title block's scale text ("1/4\" = 1'-0\"", "AS NOTED").
  scaleLabel: string;
  // The seal box and department approval stamp area (permit sets only, S13 Decisions 5, 10).
  stampAreas: boolean;
  viewports: readonly PdfViewport[];
};

export type PdfInput = {
  size: SheetSize;
  // The document title (the file name without ".pdf").
  title: string;
  sheets: readonly PdfSheet[];
  // One bookmark per sheet (S15c Bookmarks, on by default).
  bookmarks: boolean;
};

// The two drawing fonts, the faces the geometry package measures text with (EZD-238 font table), read from the
// committed files (EZD-010c: woff2 files live only in app/src/styles/fonts/) and embedded as subsets.
const FONT_FILES = {
  'dm-mono-400': new URL('../../../styles/fonts/dm-mono-latin-400-normal.woff2', import.meta.url),
  'instrument-sans-600': new URL('../../../styles/fonts/instrument-sans-latin-600-normal.woff2', import.meta.url),
} as const;
type FontName = keyof typeof FONT_FILES;

let fontCache: Record<FontName, Buffer> | null = null;
function fonts(): Record<FontName, Buffer> {
  fontCache ??= {
    'dm-mono-400': readFileSync(FONT_FILES['dm-mono-400']),
    'instrument-sans-600': readFileSync(FONT_FILES['instrument-sans-600']),
  };
  return fontCache;
}

const INK = '#000000';
const PAPER = '#ffffff';
const POCHE = '#c8c8c8';
// As the sheet preview: what is removed is drawn dashed with no poché (EZD-703).
const FILLED: ReadonlySet<DrawingLayer> = new Set(['existing', 'new']);
const FRAME_PEN_IN = 0.35 / 25.4;
const BOX_PEN_IN = 0.18 / 25.4;
const SHEET_NUMBER_PT = 54;
const SHEET_TITLE_PT = 10;
const EXTENSION_IN = 0.1;
const TICK_HALF_IN = ((4 / 7) * SHEET_DIMENSION_PT) / 72;

type Doc = InstanceType<typeof PDFDocument>;
type Xy = [number, number];

const pt = (inches: number) => inches * PT_PER_IN;
// No line breaking, and no OpenType substitutions: DM Mono's contextual alternates swap the prime and quote glyphs
// for ones with no Unicode mapping, so the printed 4'-0" would not read back or search as text.
const TEXT = { lineBreak: false, features: [] as string[] } as const;

function tagged(doc: Doc, tag: string, draw: () => void): void {
  doc.addContent(`/EZ_${tag.replace(/-/g, '_')} BMC`);
  draw();
  doc.addContent('EMC');
}

function pen(doc: Doc, role: LineWeightRole, layer?: DrawingLayer): void {
  doc.lineWidth(pt(SHEET_PEN_IN[role])).lineCap('round').strokeColor(INK);
  if (role === 'hidden' || layer === 'demo')
    doc.dash(pt(SHEET_HIDDEN_DASH_IN[0]), { space: pt(SHEET_HIDDEN_DASH_IN[1]) });
  else doc.undash();
}

// Text centred on `at` (points); `baseline` as the sheet preview: dimensions sit on the point, other text is centred.
function centredText(
  doc: Doc,
  text: string,
  at: Xy,
  o: { font: FontName; sizePt: number; baseline: 'middle' | 'bottom'; spacingPt?: number; rotationDeg?: number },
): void {
  doc.font(o.font).fontSize(o.sizePt).fillColor(INK);
  const opts = { ...TEXT, baseline: o.baseline, characterSpacing: o.spacingPt ?? 0 } as const;
  const w = doc.widthOfString(text, opts);
  const rotate = (o.rotationDeg ?? 0) !== 0;
  if (rotate) doc.save().rotate(-(o.rotationDeg ?? 0), { origin: at });
  doc.text(text, at[0] - w / 2, at[1], opts);
  if (rotate) doc.restore();
}

function drawList(doc: Doc, list: DrawingList, scale: number, area: SheetArea): void {
  const b = drawingListBounds(list);
  if (b === null) return;
  // As sheetSvg: the drawing's centre goes to the area's centre; model y up becomes paper y down.
  const mx = (b.minX + b.maxX) / 2;
  const my = (b.minY + b.maxY) / 2;
  const cx = area.x + area.width / 2;
  const cy = area.y + area.height / 2;
  const P = (p: Point): Xy => [pt(cx + (p.x - mx) * scale), pt(cy - (p.y - my) * scale)];

  for (const item of list.items) {
    tagged(doc, item.layer, () => drawItem(doc, item, P));
  }
}

function drawItem(doc: Doc, item: DrawingItem, P: (p: Point) => Xy): void {
  switch (item.kind) {
    case 'line':
      pen(doc, item.role, item.layer);
      doc.moveTo(...P(item.from)).lineTo(...P(item.to)).stroke();
      return;
    case 'arc':
      pen(doc, item.role, item.layer);
      drawArc(doc, item, P);
      doc.stroke();
      return;
    case 'fill': {
      if (!FILLED.has(item.layer) || item.points.length < 3) return;
      const [first, ...rest] = item.points;
      doc.moveTo(...P(first!));
      for (const p of rest) doc.lineTo(...P(p));
      doc.closePath().fill(POCHE);
      return;
    }
    case 'hatch':
      if (item.segments.length === 0) return;
      pen(doc, item.role, item.layer);
      for (const s of item.segments) doc.moveTo(...P(s.from)).lineTo(...P(s.to));
      doc.stroke();
      return;
    case 'text':
      // Text keeps its printed size at any scale, never under 3/32".
      centredText(doc, item.text, P(item.at), {
        font: item.font,
        sizePt: Math.max(item.sizePt, SHEET_TEXT_MIN_PT),
        baseline: item.layer === 'dimensions' ? 'bottom' : 'middle',
        spacingPt: item.font === 'instrument-sans-600' ? item.letterSpacingPt : 0,
        rotationDeg: item.rotationDeg,
      });
      return;
  }
}

// A counter-clockwise model arc as cubic Béziers of at most 90° each, computed in model space and mapped point by
// point (EZD-028 spike).
function drawArc(doc: Doc, arc: Extract<DrawingItem, { kind: 'arc' }>, P: (p: Point) => Xy): void {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  let sweep = arc.endAngle - arc.startAngle;
  while (sweep <= 0) sweep += 360;
  const parts = Math.max(1, Math.ceil(sweep / 90 - 1e-9));
  const step = sweep / parts;
  const at = (deg: number): Point => ({
    x: arc.center.x + arc.radius * Math.cos(rad(deg)),
    y: arc.center.y + arc.radius * Math.sin(rad(deg)),
  });
  doc.moveTo(...P(at(arc.startAngle)));
  for (let i = 0; i < parts; i++) {
    const a0 = arc.startAngle + i * step;
    const a1 = a0 + step;
    const h = (4 / 3) * Math.tan(rad(step) / 4) * arc.radius;
    const p0 = at(a0);
    const p3 = at(a1);
    const c1 = { x: p0.x - h * Math.sin(rad(a0)), y: p0.y + h * Math.cos(rad(a0)) };
    const c2 = { x: p3.x + h * Math.sin(rad(a1)), y: p3.y - h * Math.cos(rad(a1)) };
    doc.bezierCurveTo(...P(c1), ...P(c2), ...P(p3));
  }
}

const paper = (p: { x: number; y: number }): Xy => [pt(p.x), pt(p.y)];

function drawPrintMarks(doc: Doc, marks: PrintMarks): void {
  if (marks.kind === 'nts') {
    tagged(doc, 'nts', () => {
      doc.font('dm-mono-400').fontSize(SHEET_DIMENSION_PT).fillColor(INK);
      doc.text(marks.label, pt(marks.labelAt.x), pt(marks.labelAt.y), { ...TEXT, baseline: 'middle' });
    });
    return;
  }
  tagged(doc, 'scale-bar', () => {
    doc.lineWidth(pt(SHEET_PEN_IN.dimension)).undash();
    for (const s of marks.scaleBar.segments) {
      doc.rect(pt(s.x), pt(s.y), pt(s.width), pt(s.height)).fillAndStroke(s.filled ? INK : PAPER, INK);
    }
    for (const l of marks.scaleBar.labels)
      centredText(doc, l.text, paper(l.at), { font: 'dm-mono-400', sizePt: SHEET_NOTE_PT, baseline: 'middle' });
  });
  const c = marks.check;
  tagged(doc, 'check-dimension', () => {
    doc.lineWidth(pt(SHEET_PEN_IN.dimension)).lineCap('round').undash().strokeColor(INK);
    doc.moveTo(...paper(c.from)).lineTo(...paper(c.to)).stroke();
  });
  tagged(doc, 'check-dimension-ends', () => {
    for (const end of [c.from, c.to]) {
      doc.moveTo(pt(end.x), pt(end.y - EXTENSION_IN)).lineTo(pt(end.x), pt(end.y + EXTENSION_IN));
      const d = TICK_HALF_IN * Math.SQRT1_2;
      doc.moveTo(pt(end.x - d), pt(end.y + d)).lineTo(pt(end.x + d), pt(end.y - d));
    }
    doc.stroke();
  });
  tagged(doc, 'check-dimension-label', () =>
    centredText(doc, c.label, paper(c.labelAt), { font: 'dm-mono-400', sizePt: SHEET_DIMENSION_PT, baseline: 'bottom' }),
  );
  tagged(doc, 'check-dimension-caption', () =>
    centredText(doc, c.caption, paper(c.captionAt), { font: 'dm-mono-400', sizePt: SHEET_NOTE_PT, baseline: 'middle' }),
  );
}

// The border, the title block column with its blank seal box and stamp area, and the sheet number and title.
function drawFrame(doc: Doc, size: SheetSize, sheet: PdfSheet): void {
  const { width, height } = paperInches(size);
  const { margin, titleBlock } = sheetFrame(size);
  const column = { x: width - margin - titleBlock, y: margin, width: titleBlock, height: height - 2 * margin };
  const L = titleBlockLayout(column, sheet.stampAreas);
  tagged(doc, 'frame', () => {
    doc.lineWidth(pt(FRAME_PEN_IN)).undash().strokeColor(INK);
    doc.rect(pt(margin), pt(margin), pt(width - 2 * margin), pt(height - 2 * margin)).stroke();
    doc.rect(pt(column.x), pt(column.y), pt(column.width), pt(column.height)).stroke();
  });
  for (const [tag, box] of [
    ['seal', L.seal],
    ['stamp', L.stamp],
  ] as const) {
    if (box === null) continue;
    tagged(doc, tag, () => {
      doc.lineWidth(pt(BOX_PEN_IN)).dash(pt(0.06 * L.k), { space: pt(0.04 * L.k) });
      doc.rect(pt(box.x), pt(box.y), pt(box.width), pt(box.height)).stroke();
      doc.undash();
    });
  }
  const pad = 0.1 * L.k;
  tagged(doc, 'sheet-title', () => {
    doc.font('instrument-sans-600').fontSize(SHEET_TITLE_PT * L.k).fillColor(INK);
    doc.text(sheet.title.toUpperCase(), pt(L.sheetTitle.x + pad), pt(L.sheetTitle.y + L.sheetTitle.height - pad), {
      ...TEXT,
      baseline: 'alphabetic',
    });
  });
  tagged(doc, 'sheet-scale', () => {
    doc.font('dm-mono-400').fontSize(7 * L.k).fillColor(INK);
    doc.text(sheet.scaleLabel, pt(L.scale.x + pad), pt(L.scale.y + L.scale.height - pad), {
      ...TEXT,
      baseline: 'alphabetic',
    });
  });
  tagged(doc, 'sheet-number', () =>
    centredText(doc, sheet.number, [pt(L.sheet.x + L.sheet.width / 2), pt(L.sheet.y + L.sheet.height * 0.55)], {
      font: 'instrument-sans-600',
      sizePt: SHEET_NUMBER_PT * L.k,
      baseline: 'bottom',
    }),
  );
}

export function writePdf(input: PdfInput): Promise<Uint8Array> {
  const page = pagePoints(input.size);
  // `font: null` keeps PDFKit from writing its default Helvetica (EZD-028 Risks: Default font); no password options,
  // so the file is not encrypted.
  const doc = new PDFDocument({
    size: [page.width, page.height],
    margin: 0,
    font: null,
    autoFirstPage: false,
    info: { Title: input.title, Creator: 'EZ Draft', Producer: 'EZ Draft' },
  });
  for (const [name, bytes] of Object.entries(fonts())) doc.registerFont(name, bytes);

  const chunks: Buffer[] = [];
  const done = new Promise<Uint8Array>((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on('error', reject);
  });

  for (const sheet of input.sheets) {
    doc.addPage({ size: [page.width, page.height], margin: 0 });
    if (input.bookmarks) doc.outline.addItem(`${sheet.number} ${sheet.title}`);
    drawFrame(doc, input.size, sheet);
    for (const vp of sheet.viewports) {
      if (vp.list.items.length === 0) continue;
      if (vp.marks === false) {
        drawList(doc, vp.list, vp.scale ?? 1, vp.area);
        continue;
      }
      const { drawing } = splitPrintMarkBand(vp.area);
      drawList(doc, vp.list, vp.scale ?? ntsScale(vp.list, drawing), drawing);
      drawPrintMarks(doc, printMarks(vp.scale, vp.area));
    }
  }
  doc.end();
  return done;
}

// EZD-305 (S01 PDF: detect type "Vector PDF: auto-detect walls ... Scanned PDF: trace-only"; 02 Stack PDF in:
// pdf.js): reads one page of a PDF into the straight stroked lines the wall detector needs, in page points (PDF user
// space, y up), each with its drawn line width, plus the image count that marks a scanned page. Runs in background
// jobs only, with the pdf.js legacy build (the Node build; docs/architecture.md "Where pdf.js runs"). The operator
// walk is the one the fixture tests use (scripts/fixtures/__tests__/synthetic.test.mjs walkOps): the graphics-state
// stack (with form XObjects' implicit save, matrix and restore), cm, setLineWidth and constructPath with pdf.js's path ops (moveTo 0, lineTo 1, curveTo 2,
// quadraticCurveTo 3, closePath 4). A file pdf.js cannot open is refused (unreadable_pdf), as is a page that does
// not exist (pdf_page_missing).
import type { PdfPoint } from '../../../lib/imports/scale-calibration';

export type PdfSegment = { a: PdfPoint; b: PdfPoint; width: number };

export type PdfPageRead = {
  pageNumber: number;
  /** Straight stroked segments in page points; curves are counted, not kept. */
  segments: PdfSegment[];
  curveCount: number;
  imageCount: number;
  /** Page point to the drawn page at scale 1, from the top-left (pdf.js viewport; applies /Rotate). */
  toImage: (p: PdfPoint) => { x: number; y: number };
};

export class PdfReadError extends Error {
  constructor(readonly code: 'unreadable_pdf' | 'pdf_page_missing') {
    super(code);
    this.name = 'PdfReadError';
  }
}

type Matrix = [number, number, number, number, number, number];

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5],
];

const STROKE_OPS = [
  'stroke',
  'closeStroke',
  'fillStroke',
  'eoFillStroke',
  'closeFillStroke',
  'closeEOFillStroke',
] as const;

type OperatorList = { fnArray: number[]; argsArray: unknown[] };

/** Walks an operator list (exported for its tests). `ops` is pdf.js's OPS table. */
export function walkOperators(
  ops: Record<string, number>,
  list: OperatorList,
): Pick<PdfPageRead, 'segments' | 'curveCount' | 'imageCount'> {
  const strokes = new Set(STROKE_OPS.map((name) => ops[name]));
  const imageOps = new Set(
    Object.entries(ops)
      .filter(([name]) => /^paint.*Image/.test(name))
      .map(([, v]) => v),
  );
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  let lineWidth = 1;
  const stack: Array<[Matrix, number]> = [];
  const segments: PdfSegment[] = [];
  let curveCount = 0;
  let imageCount = 0;
  const apply = (x: number, y: number): PdfPoint => [
    ctm[0] * x + ctm[2] * y + ctm[4],
    ctm[1] * x + ctm[3] * y + ctm[5],
  ];

  list.fnArray.forEach((fn, i) => {
    const args = list.argsArray[i] as unknown[];
    if (imageOps.has(fn)) imageCount += 1;
    if (fn === ops.save) stack.push([ctm, lineWidth]);
    else if (fn === ops.restore) [ctm, lineWidth] = stack.pop() ?? [ctm, lineWidth];
    else if (fn === ops.paintFormXObjectBegin) {
      // A form XObject: pdf.js saves the state and applies the form's matrix, and restores at its end.
      stack.push([ctm, lineWidth]);
      const m = args?.[0] as ArrayLike<number> | null | undefined;
      if (m && m.length === 6) ctm = multiply(Array.from(m) as Matrix, ctm);
    } else if (fn === ops.paintFormXObjectEnd) [ctm, lineWidth] = stack.pop() ?? [ctm, lineWidth];
    else if (fn === ops.transform) ctm = multiply(args as Matrix, ctm);
    else if (fn === ops.setLineWidth) lineWidth = Number(args[0]);
    else if (fn === ops.constructPath && strokes.has(args[0] as number)) {
      // The drawn width: the line width through the current transform (its area scale).
      const width = lineWidth * Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]));
      const buf = ((args[1] as ArrayLike<number>[] | undefined)?.[0] ?? []) as ArrayLike<number>;
      let cur: PdfPoint | null = null;
      let start: PdfPoint | null = null;
      for (let k = 0; k < buf.length; ) {
        const op = buf[k++];
        if (op === 0) {
          cur = start = apply(buf[k], buf[k + 1]);
          k += 2;
        } else if (op === 1) {
          const p = apply(buf[k], buf[k + 1]);
          if (cur) segments.push({ a: cur, b: p, width });
          cur = p;
          k += 2;
        } else if (op === 2) {
          curveCount += 1;
          cur = apply(buf[k + 4], buf[k + 5]);
          k += 6;
        } else if (op === 3) {
          curveCount += 1;
          cur = apply(buf[k + 2], buf[k + 3]);
          k += 4;
        } else if (op === 4) {
          if (cur && start && (cur[0] !== start[0] || cur[1] !== start[1])) {
            segments.push({ a: cur, b: start, width });
          }
          cur = start;
        } else {
          // An op this walk does not know: the rest of this path cannot be read safely.
          break;
        }
      }
    }
  });
  return { segments, curveCount, imageCount };
}

/** Reads page `pageNumber` (1-based) of a PDF. */
export async function readPdfPage(bytes: Uint8Array, pageNumber = 1): Promise<PdfPageRead> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // pdf.js may detach the buffer it is given; it reads a copy.
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    verbosity: 0,
    disableFontFace: true,
  });
  try {
    let doc: Awaited<typeof task.promise>;
    try {
      doc = await task.promise;
    } catch {
      throw new PdfReadError('unreadable_pdf');
    }
    if (pageNumber < 1 || pageNumber > doc.numPages) throw new PdfReadError('pdf_page_missing');
    let page: Awaited<ReturnType<typeof doc.getPage>>;
    let list: OperatorList;
    try {
      page = await doc.getPage(pageNumber);
      list = (await page.getOperatorList()) as unknown as OperatorList;
    } catch {
      throw new PdfReadError('unreadable_pdf');
    }
    const viewport = page.getViewport({ scale: 1 });
    const walked = walkOperators(pdfjs.OPS as unknown as Record<string, number>, list);
    return {
      pageNumber,
      ...walked,
      toImage: (p) => {
        const [x, y] = viewport.convertToViewportPoint(p[0], p[1]);
        return { x, y };
      },
    };
  } finally {
    await task.destroy();
  }
}

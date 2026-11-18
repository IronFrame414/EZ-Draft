// EZD-304 (S01 PDF: scale calibration; 02 Stack PDF in: pdf.js; 08 Imports "Underlay for tracing"): open page 1 of a
// PDF and draw it, for the set-scale step and the plan underlay. Image pixels count from the top-left; toPdf and
// toImage turn them into page points (PDF user space, y up) and back through the pdf.js viewport, which applies the
// page's /Rotate; the underlay is placed from the drawn image, so it lies in the plan as the page was shown. Browser only; loaded through lazyModule (11 Performance rule 7).
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from 'pdfjs-dist';
import {
  underlayQuad,
  type PdfPoint,
  type ScaleCalibration,
  type UnderlayQuad,
} from '../../lib/imports/scale-calibration';

/** The longest side of a page drawn for the plan; larger textures are refused by some tablets' GPUs. */
export const UNDERLAY_MAX_PX = 4096;

export type PdfPage = {
  pageNumber: number;
  /** The page's size in points at scale 1, as drawn (after its rotation). */
  widthPt: number;
  heightPt: number;
  /** Draws the page at `scale` image pixels per point; the canvas takes the drawn size. */
  draw(canvas: HTMLCanvasElement, scale: number): Promise<void>;
  toPdf(scale: number, x: number, y: number): PdfPoint;
  toImage(scale: number, p: PdfPoint): { x: number; y: number };
  close(): Promise<void>;
};

let workerReady = false;
function ensureWorker(): void {
  if (workerReady) return;
  GlobalWorkerOptions.workerPort = new Worker(
    new URL('../../workers/pdf.worker.ts', import.meta.url),
    {
      type: 'module',
    },
  );
  workerReady = true;
}

async function bytesOf(source: Blob | string): Promise<Uint8Array> {
  if (typeof source !== 'string') return new Uint8Array(await source.arrayBuffer());
  const res = await fetch(source);
  if (!res.ok) throw new Error(`pdf fetch ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Opens page `pageNumber` of a PDF; rejects for a file pdf.js cannot read. */
export async function openPdfPage(source: Blob | string, pageNumber = 1): Promise<PdfPage> {
  ensureWorker();
  const data = await bytesOf(source);
  const task = getDocument({ data, verbosity: 0 });
  let doc: PDFDocumentProxy;
  try {
    doc = await task.promise;
  } catch (e) {
    await task.destroy().catch(() => {});
    throw e;
  }
  let page: PDFPageProxy;
  try {
    page = await doc.getPage(pageNumber);
  } catch (e) {
    await task.destroy().catch(() => {});
    throw e;
  }
  const at = (scale: number) => page.getViewport({ scale });
  const base = at(1);
  return {
    pageNumber,
    widthPt: base.width,
    heightPt: base.height,
    async draw(canvas, scale) {
      const viewport = at(scale);
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('no 2d context');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
    },
    toPdf(scale, x, y) {
      const [px, py] = at(scale).convertToPdfPoint(x, y);
      return [px, py];
    },
    toImage(scale, p) {
      const [x, y] = at(scale).convertToViewportPoint(p[0], p[1]);
      return { x, y };
    },
    async close() {
      await task.destroy().catch(() => {});
    },
  };
}

/** The calibrated page drawn for the plan, with the plan positions of its corners. */
export async function drawUnderlay(
  page: PdfPage,
  cal: ScaleCalibration,
): Promise<{ image: HTMLCanvasElement; corners: UnderlayQuad['corners'] }> {
  const scale = UNDERLAY_MAX_PX / Math.max(page.widthPt, page.heightPt);
  const canvas = document.createElement('canvas');
  await page.draw(canvas, scale);
  const quad = underlayQuad(
    cal,
    { scale, toImage: (p) => page.toImage(scale, p) },
    { width: canvas.width, height: canvas.height },
  );
  return { image: canvas, corners: quad.corners };
}

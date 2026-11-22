// EZD-915 (S12 Supplier PDF import; S02 States "Supplier kitchen PDF: cabinet labels read (W3030, B24) and plan vs
// elevation cross-check results shown per cabinet"; AC-EZD-915-1): the stand-in supplier PDF read page by page, and
// the cross-check on hand-made pages. Expected values come from fixtures/synthetic/supplier-kitchen.pdf.expected.json
// (hand-written from the fixture design) and from the confidence rules in vault/build/assumptions.md EZD-915
// (both views agree 95, no elevation 70, a view that differs 50).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { readPdfPages, type PdfPageRead, type PdfSegment } from '../pdf-walls/read-pdf';
import { detectSupplierPdf } from './detect';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const FIXTURE = path.join(repo, 'fixtures/synthetic/supplier-kitchen.pdf');
const SCANNED = path.join(repo, 'fixtures/synthetic/room-12x10-scanned.pdf');
const expected = JSON.parse(readFileSync(`${FIXTURE}.expected.json`, 'utf8'));

describe('EZD-915 the fixture supplier PDF', () => {
  let pages: PdfPageRead[];
  beforeAll(async () => {
    pages = await readPdfPages(new Uint8Array(readFileSync(FIXTURE)));
  });

  it('reads every page with its labels', () => {
    expect(pages).toHaveLength(expected.pageCount);
    for (const p of expected.pages) {
      const strs = pages[p.page - 1].texts.map((t) => t.str);
      expect(strs).toEqual(expect.arrayContaining([...p.labels, p.title]));
    }
  });

  it('AC-EZD-915-1: gives the labelled cabinet boxes with sizes from their labels', () => {
    const d = detectSupplierPdf(pages);
    expect(d.cabinets).toHaveLength(expected.cabinets.length);
    for (const want of expected.cabinets) {
      const got = d.cabinets.find((c) => c.code === want.code);
      expect(got, want.code).toBeDefined();
      expect(got).toMatchObject({
        type: 'cabinet',
        boxType: want.boxType,
        width: want.width,
        depth: want.depth,
        height: want.height,
        check: { plan: want.crossCheck, elevation: want.crossCheck },
        confidence: 95,
      });
      expect(got!.center.x).toBeCloseTo(want.centerIn.x, 6);
      expect(got!.center.y).toBeCloseTo(want.centerIn.y, 6);
      expect(got!.check.planSize!.long).toBeCloseTo(Math.max(want.planOutlineIn.width, want.planOutlineIn.depth), 6);
      expect(got!.check.planSize!.short).toBeCloseTo(Math.min(want.planOutlineIn.width, want.planOutlineIn.depth), 6);
      expect(got!.check.elevationSize!.width).toBeCloseTo(want.elevationOutlineIn.width, 6);
      expect(got!.check.elevationSize!.height).toBeCloseTo(want.elevationOutlineIn.height, 6);
    }
  });

  it('the two boxes touch, so they are one run, and the plan wall is read', () => {
    const d = detectSupplierPdf(pages);
    expect(new Set(d.cabinets.map((c) => c.run)).size).toBe(expected.runs);
    expect(d.walls).toHaveLength(expected.wall.count);
    const w = d.walls[0];
    const len = Math.hypot(w.geometry.end.x - w.geometry.start.x, w.geometry.end.y - w.geometry.start.y);
    expect(len).toBeCloseTo(expected.wall.lengthIn, 6);
    expect(w.thickness).toBeCloseTo(expected.wall.thicknessIn, 6);
  });

  it('a scanned page gives nothing to review (trace-assist)', async () => {
    const scanned = await readPdfPages(new Uint8Array(readFileSync(SCANNED)));
    const d = detectSupplierPdf(scanned);
    expect(d.cabinets).toEqual([]);
    expect(d.walls).toEqual([]);
  });
});

// Hand-made pages at 1.5 pt per inch (the PDF default scale): a box is four 0.5 pt strokes with its code inside.
const rect = (x0: number, y0: number, w: number, h: number): PdfSegment[] => {
  const [x1, y1] = [x0 + w * 1.5, y0 + h * 1.5];
  const s = (a: [number, number], b: [number, number]) => ({ a, b, width: 0.5 });
  return [s([x0, y0], [x1, y0]), s([x1, y0], [x1, y1]), s([x1, y1], [x0, y1]), s([x0, y1], [x0, y0])];
};
const page = (n: number, boxes: Array<{ code: string; x: number; y: number; w: number; h: number }>): PdfPageRead => ({
  pageNumber: n,
  segments: boxes.flatMap((b) => rect(b.x, b.y, b.w, b.h)),
  texts: boxes.map((b) => ({ str: b.code, at: [b.x + (b.w * 1.5) / 2, b.y + (b.h * 1.5) / 2], height: 8 })),
  curveCount: 0,
  imageCount: 0,
  toImage: (p) => ({ x: p[0], y: 792 - p[1] }),
});

describe('EZD-915 plan vs elevation cross-check', () => {
  it('an elevation that reads another width marks the cabinet to check (50)', () => {
    const d = detectSupplierPdf([
      page(1, [{ code: 'B24', x: 100, y: 100, w: 24, h: 24 }]),
      page(2, [{ code: 'B24', x: 100, y: 100, w: 27, h: 34.5 }]),
    ]);
    expect(d.cabinets).toHaveLength(1);
    expect(d.cabinets[0]).toMatchObject({ width: 24, confidence: 50, check: { plan: 'agrees', elevation: 'differs' } });
    expect(d.cabinets[0].check.elevationSize!.width).toBeCloseTo(27, 6);
  });

  it('a plan box that reads another size marks the cabinet to check (50)', () => {
    const d = detectSupplierPdf([
      page(1, [{ code: 'W3030', x: 100, y: 100, w: 33, h: 12 }]),
      page(2, [{ code: 'W3030', x: 100, y: 100, w: 30, h: 30 }]),
    ]);
    expect(d.cabinets[0]).toMatchObject({ width: 30, confidence: 50, check: { plan: 'differs', elevation: 'agrees' } });
  });

  it('a plan box turned along a side wall still agrees (depth by width)', () => {
    const d = detectSupplierPdf([
      page(1, [{ code: 'W3030', x: 100, y: 100, w: 12, h: 30 }]),
      page(2, [{ code: 'W3030', x: 100, y: 100, w: 30, h: 30 }]),
    ]);
    expect(d.cabinets[0]).toMatchObject({ confidence: 95, check: { plan: 'agrees', elevation: 'agrees' } });
  });

  it('no elevation for a cabinet gives 70; within 1/2" still agrees', () => {
    const d = detectSupplierPdf([page(1, [{ code: 'B24', x: 100, y: 100, w: 24.25, h: 24 }])]);
    expect(d.cabinets[0]).toMatchObject({ confidence: 70, check: { plan: 'agrees', elevation: 'missing' } });
    expect(d.cabinets[0].check.elevationSize).toBeNull();
  });

  it('two boxes of one code pair with the elevation boxes in reading order', () => {
    const d = detectSupplierPdf([
      page(1, [
        { code: 'B24', x: 100, y: 100, w: 24, h: 24 },
        { code: 'B24', x: 300, y: 100, w: 24, h: 24 },
      ]),
      page(2, [
        { code: 'B24', x: 100, y: 100, w: 24, h: 34.5 },
        { code: 'B24', x: 300, y: 100, w: 21, h: 34.5 },
      ]),
    ]);
    expect(d.cabinets.map((c) => c.check.elevation)).toEqual(['agrees', 'differs']);
    // Not touching (200 pt apart): two runs.
    expect(d.cabinets.map((c) => c.run)).toEqual([1, 2]);
  });

  it('a label with no box around it has no outline and is to check', () => {
    const p = page(1, []);
    p.texts = [{ str: 'B24', at: [100, 100], height: 8 }];
    const d = detectSupplierPdf([p]);
    expect(d.cabinets[0]).toMatchObject({ outline: null, confidence: 50, check: { plan: 'missing' } });
  });
});

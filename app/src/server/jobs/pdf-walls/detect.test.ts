// EZD-305 AC-EZD-305-1 "The fixture vector PDF gives wall items", AC-EZD-305-2 "the fixture scanned PDF returns zero
// items" (S01 PDF: detect type; S02 States Empty). Expected values come from the fixtures' hand-written JSON:
// fixtures/synthetic/room-12x10-vector.pdf.expected.json and room-12x10-scanned.pdf.expected.json.
//
// Vector page: 16 wall segments at 1.5 pt and 4 other lines plus 1 curve at 0.5 pt (`wallSegments`, `otherSegments`,
// `wallLineWidth`, `otherLineWidth`), so the wall weight keeps exactly the 16. With `calibration[0]` (216 pt is
// 144 in, a at [504, 300]) one point is 2/3 in and the plan origin is the room's south-west interior corner. In plan
// inches the interior faces are north y 120 from x 0 to 144, west x 0 and east x 144 from y 0 to 120, and south y 0
// in three pieces, x 0-12, 48-84 and 120-144, broken by the door gap (522-576 pt) and the window gap (630-684 pt);
// each has its exterior face 6.75 pt = 4.5 in outside it. The jambs are end caps, not walls (EZD-302 detector), and
// no opening is read, so nothing bridges the two gaps: 6 walls, each 4.5 in thick.
// Scanned page: one image and no path operators (`imagePaintOps` 1, `pathOps` 0), so no items.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ScaleCalibration } from '../../../lib/imports/scale-calibration';
import { detectPdfWalls, wallSegments } from './detect';
import { readPdfPage, walkOperators, PdfReadError, type PdfPageRead } from './read-pdf';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const VECTOR = path.join(repo, 'fixtures/synthetic/room-12x10-vector.pdf');
const SCANNED = path.join(repo, 'fixtures/synthetic/room-12x10-scanned.pdf');
const vectorExpected = JSON.parse(readFileSync(`${VECTOR}.expected.json`, 'utf8'));
const scannedExpected = JSON.parse(readFileSync(`${SCANNED}.expected.json`, 'utf8'));

const TOL = 0.5; // 08 Imports "About 0.5\"" (the detector's tolerance)

type Seg = { start: { x: number; y: number }; end: { x: number; y: number } };
/** A wall as its two end points sorted, so the drawing direction does not matter. */
const ends = (g: Seg) =>
  [g.start, g.end]
    .map((p) => [p.x, p.y] as [number, number])
    .sort((p, q) => p[0] - q[0] || p[1] - q[1]);

function expectWallsAt(
  walls: Array<{ geometry: Seg }>,
  expected: Array<[[number, number], [number, number]]>,
) {
  expect(walls).toHaveLength(expected.length);
  const remaining = walls.map((w) => ends(w.geometry));
  for (const want of expected) {
    const k = remaining.findIndex((got) =>
      got.every((p, i) => Math.abs(p[0] - want[i][0]) <= TOL && Math.abs(p[1] - want[i][1]) <= TOL),
    );
    expect(k, `wall ${JSON.stringify(want)}`).toBeGreaterThanOrEqual(0);
    remaining.splice(k, 1);
  }
}

const INTERIOR_FACES: Array<[[number, number], [number, number]]> = [
  [[0, 120], [144, 120]],
  [[0, 0], [0, 120]],
  [[144, 0], [144, 120]],
  [[0, 0], [12, 0]],
  [[48, 0], [84, 0]],
  [[120, 0], [144, 0]],
];

describe('EZD-305 vector PDF wall detection', () => {
  let vector: PdfPageRead;
  let scanned: PdfPageRead;
  const cal = vectorExpected.calibration[0];
  const calibration: ScaleCalibration = { page: 1, a: cal.from, b: cal.to, lengthIn: cal.lengthIn };

  beforeAll(async () => {
    vector = await readPdfPage(new Uint8Array(readFileSync(VECTOR)));
    scanned = await readPdfPage(new Uint8Array(readFileSync(SCANNED)));
  });

  it('reads the vector page: the wall weight keeps the wall lines only', () => {
    expect(vector.segments).toHaveLength(vectorExpected.straightSegmentCount);
    expect(vector.curveCount).toBe(vectorExpected.curveCount);
    expect(vector.imageCount).toBe(vectorExpected.imagePaintOps);
    const walls = wallSegments(vector);
    expect(walls).toHaveLength(vectorExpected.wallSegments.length);
    for (const s of walls) expect(s.width).toBe(vectorExpected.wallLineWidth);
  });

  it('AC-EZD-305-1: the fixture vector PDF gives wall items, on the calibrated plan', () => {
    const d = detectPdfWalls(vector, calibration);
    const items = [...d.walls, ...d.openings, ...d.rooms];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.type === 'wall')).toBe(true);
    expectWallsAt(d.walls, INTERIOR_FACES);
    for (const w of d.walls) {
      // 6.75 pt between the faces (wallSegments) at 2/3 in per point.
      expect(w.thickness).toBeCloseTo(4.5, 6);
      expect(w.confidence).toBeGreaterThan(0);
      expect(w.confidence).toBeLessThanOrEqual(100);
    }
    // The calibration's two lengths (calibration[0] 144 in, calibration[1] 120 in) are the north and side walls.
    const lengths = d.walls.map((w) =>
      Math.hypot(w.geometry.end.x - w.geometry.start.x, w.geometry.end.y - w.geometry.start.y),
    );
    expect(lengths[0]).toBeCloseTo(vectorExpected.calibration[0].lengthIn, 6);
    expect(lengths.filter((l) => Math.abs(l - vectorExpected.calibration[1].lengthIn) < 1e-6)).toHaveLength(2);
  });

  it('without a stored scale the page is read at 1/4" = 1\'-0" from the page origin (Q-0203)', () => {
    const d = detectPdfWalls(vector, null);
    // 1/4" = 1'-0" is the fixture's own drawing scale (mapping.ptPerIn 1.5), so the walls are the same size, moved
    // by the room origin [504, 300] pt at 2/3 in per point: 336 in east, 200 in north.
    const [ox, oy] = vectorExpected.mapping.originPt.map((v: number) => v / vectorExpected.mapping.ptPerIn);
    expectWallsAt(
      d.walls,
      INTERIOR_FACES.map(([p, q]) => [
        [p[0] + ox, p[1] + oy],
        [q[0] + ox, q[1] + oy],
      ]),
    );
  });

  it('AC-EZD-305-2: the fixture scanned PDF returns zero items', () => {
    expect(scanned.imageCount).toBe(scannedExpected.imagePaintOps);
    expect(scanned.segments).toHaveLength(scannedExpected.pathOps);
    const d = detectPdfWalls(scanned, null);
    expect([...d.walls, ...d.openings, ...d.rooms]).toEqual([]);
  });

  it('a file pdf.js cannot open is refused with unreadable_pdf', async () => {
    const err = await readPdfPage(new TextEncoder().encode('not a pdf')).catch((e) => e);
    expect(err).toBeInstanceOf(PdfReadError);
    expect(err.code).toBe('unreadable_pdf');
  });

  it('a page past the end is refused with pdf_page_missing', async () => {
    const err = await readPdfPage(new Uint8Array(readFileSync(VECTOR)), 2).catch((e) => e);
    expect(err).toBeInstanceOf(PdfReadError);
    expect(err.code).toBe('pdf_page_missing');
  });

  it('the operator walk applies cm, save and restore to points and line widths', () => {
    const OPS = {
      save: 10,
      restore: 11,
      transform: 12,
      setLineWidth: 2,
      constructPath: 91,
      stroke: 20,
      closeStroke: 21,
      fillStroke: 22,
      eoFillStroke: 23,
      closeFillStroke: 24,
      closeEOFillStroke: 25,
      fill: 26,
      paintImageXObject: 85,
    };
    const walked = walkOperators(OPS, {
      fnArray: [10, 12, 2, 91, 11, 91, 91, 85],
      argsArray: [
        null,
        [2, 0, 0, 2, 10, 20], // scale 2, then move by (10, 20)
        [1.5],
        [20, [[0, 0, 0, 1, 5, 0, 1, 5, 5, 4]]], // moveTo, lineTo, lineTo, closePath
        null,
        [20, [[0, 1, 1, 1, 2, 2]]], // after restore: identity, width back to 1
        [26, [[0, 0, 0, 1, 9, 9]]], // a fill only: not a stroke
        null,
      ],
    });
    expect(walked.segments).toEqual([
      { a: [10, 20], b: [20, 20], width: 3 },
      { a: [20, 20], b: [20, 30], width: 3 },
      { a: [20, 30], b: [10, 20], width: 3 },
      { a: [1, 1], b: [2, 2], width: 1 },
    ]);
    expect(walked.imageCount).toBe(1);
  });

  it('a form XObject applies its matrix to its lines, and its state changes end with it', () => {
    const OPS = {
      save: 10,
      restore: 11,
      transform: 12,
      setLineWidth: 2,
      constructPath: 91,
      stroke: 20,
      paintFormXObjectBegin: 74,
      paintFormXObjectEnd: 75,
    };
    const walked = walkOperators(OPS, {
      fnArray: [74, 12, 2, 91, 75, 91],
      argsArray: [
        [new Float32Array([3, 0, 0, 3, 100, 0]), [0, 0, 10, 10]], // form matrix: scale 3, then move 100 east
        [1, 0, 0, 1, 0, 10], // a cm inside the form: 10 north
        [2], // a width inside the form
        [20, [[0, 0, 0, 1, 1, 0]]],
        null,
        [20, [[0, 0, 0, 1, 1, 0]]], // after the form: identity and width 1 again
      ],
    });
    expect(walked.segments).toEqual([
      { a: [100, 30], b: [103, 30], width: 6 },
      { a: [0, 0], b: [1, 0], width: 1 },
    ]);
  });

  it('a dense page of 300,000 segments still finds the wall weight', () => {
    const segments = Array.from({ length: 300_000 }, (_, i) => ({
      a: [i, 0] as const,
      b: [i, 1] as const,
      width: i % 3 === 0 ? 1.5 : 0.5,
    }));
    expect(wallSegments({ segments })).toHaveLength(100_000);
  });
});

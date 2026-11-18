// EZD-304 (AC-EZD-304-1 "A calibrated PDF measures a known length correctly"; S01 PDF: scale calibration). Expected
// values come from fixtures/synthetic/room-12x10-vector.pdf.expected.json, written from the spec (09 Sheet set rules
// 1/4" = 1'-0", so 1.5 pt per plan inch; the interior south-west corner at (504, 300) pt): its `calibration` pairs
// are the south interior face, 216 pt = 144 in (12' 0"), and the west interior face, 180 pt = 120 in (10' 0"). The
// page is read with pdf.js (02 Stack PDF in) and the two points go through a drawn page and back, as a click does.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  calibrationOf,
  inchesPerPoint,
  measureIn,
  parseCalibrationLength,
  planPointOf,
  readCalibration,
  underlayQuad,
  type PdfPoint,
} from './scale-calibration';

const repo = path.resolve(__dirname, '../../../..');
const FIXTURE = path.join(repo, 'fixtures/synthetic/room-12x10-vector.pdf');
type Expected = {
  view: [number, number, number, number];
  tolerances: { paperPt: number };
  mapping: { ptPerIn: number; originPt: [number, number] };
  calibration: {
    from: [number, number];
    to: [number, number];
    lengthPt: number;
    lengthIn: number;
  }[];
};
const expected = JSON.parse(readFileSync(`${FIXTURE}.expected.json`, 'utf8')) as Expected;
const [south, west] = expected.calibration;
// The fixture's paper tolerance in plan inches.
const TOL_IN = expected.tolerances.paperPt / expected.mapping.ptPerIn;

type Viewport = {
  width: number;
  height: number;
  convertToViewportPoint(x: number, y: number): number[];
  convertToPdfPoint(x: number, y: number): number[];
};

async function fixtureViewport(scale: number, rotation = 0): Promise<Viewport> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(readFileSync(FIXTURE)),
    verbosity: 0,
    disableFontFace: true,
  });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    return page.getViewport({ scale, rotation }) as unknown as Viewport;
  } finally {
    await task.destroy();
  }
}

// A click on the drawn page: page point -> whole image pixel -> page point.
// The page as shown at `scale` through a pdf.js viewport (PageView of scale-calibration.ts).
const viewOf = (vp: Viewport, scale: number) => ({
  scale,
  toImage: (p: PdfPoint) => {
    const [x, y] = vp.convertToViewportPoint(p[0], p[1]);
    return { x, y };
  },
});

const clicked = (vp: Viewport, p: PdfPoint): PdfPoint => {
  const [x, y] = vp.convertToViewportPoint(p[0], p[1]);
  const [px, py] = vp.convertToPdfPoint(Math.round(x), Math.round(y));
  return [px, py];
};

describe('EZD-304 PDF scale calibration', () => {
  it('AC-EZD-304-1: calibrated on the 12\' 0" south face, the fixture PDF measures the west face as 10\' 0"', async () => {
    const vp = await fixtureViewport(150 / 72);
    const typed = parseCalibrationLength(`12' 0"`);
    expect(typed).toEqual({ ok: true, inches: south.lengthIn });
    if (!typed.ok) return;
    const cal = calibrationOf(1, clicked(vp, south.from), clicked(vp, south.to), typed.inches);
    expect(cal).not.toBeNull();
    if (cal === null) return;
    expect(inchesPerPoint(cal)).toBeCloseTo(1 / expected.mapping.ptPerIn, 9);
    const measured = measureIn(cal, clicked(vp, west.from), clicked(vp, west.to));
    expect(Math.abs(measured - west.lengthIn)).toBeLessThanOrEqual(TOL_IN);
    // The stored value reads back as the same calibration.
    expect(readCalibration(JSON.parse(JSON.stringify(cal)))).toEqual(cal);
  });

  it('the first point is the plan origin, so the fixture room lands on its 144 x 120 in interior', async () => {
    const vp = await fixtureViewport(2);
    const cal = calibrationOf(1, south.from, south.to, south.lengthIn);
    if (cal === null) throw new Error('no calibration');
    const o = planPointOf(cal, viewOf(vp, 2), expected.mapping.originPt);
    expect(o.x).toBeCloseTo(0, 9);
    expect(o.y).toBeCloseTo(0, 9);
    const ne = planPointOf(cal, viewOf(vp, 2), [720, 480]);
    expect(ne.x).toBeCloseTo(144, 9);
    expect(ne.y).toBeCloseTo(120, 9);
  });

  it('the drawn page lies over the plan at the calibrated size: 1224 x 792 pt is 816 x 528 in', async () => {
    const vp = await fixtureViewport(2);
    const cal = calibrationOf(1, south.from, south.to, south.lengthIn);
    if (cal === null) throw new Error('no calibration');
    const quad = underlayQuad(cal, viewOf(vp, 2), { width: vp.width, height: vp.height });
    const [w, h] = [
      expected.view[2] / expected.mapping.ptPerIn,
      expected.view[3] / expected.mapping.ptPerIn,
    ];
    expect([w, h]).toEqual([816, 528]);
    const [o0, o1] = expected.mapping.originPt.map((v) => v / expected.mapping.ptPerIn);
    const want = [
      { x: -o0, y: h - o1 },
      { x: w - o0, y: h - o1 },
      { x: w - o0, y: -o1 },
      { x: -o0, y: -o1 },
    ];
    quad.corners.forEach((c, i) => {
      expect(c.x).toBeCloseTo(want[i].x, 9);
      expect(c.y).toBeCloseTo(want[i].y, 9);
    });
  });

  // A page with /Rotate 90 is shown turned a quarter turn clockwise (PDF 1.7 8.3.2.3; pdf.js viewport rotation 90), so
  // page +x runs down the image and page +y runs right. The underlay must lie as the page was shown: the image upright
  // (792 x 1224 pt drawn, 528 x 816 in), the south face from the origin pointing south and the west face pointing
  // east, so the room's north-east interior corner (720, 480) pt lands at (120, -144) in. Lengths do not change.
  it('a rotated page lies in the plan as it was shown, upright and at the same scale', async () => {
    const scale = 2;
    const vp = await fixtureViewport(scale, 90);
    expect([vp.width, vp.height]).toEqual([792 * scale, 1224 * scale]);
    const cal = calibrationOf(1, south.from, south.to, south.lengthIn);
    if (cal === null) throw new Error('no calibration');
    const view = viewOf(vp, scale);
    const quad = underlayQuad(cal, view, { width: vp.width, height: vp.height });
    const [tl, tr, br, bl] = quad.corners;
    expect(tr.x - tl.x).toBeCloseTo(528, 9);
    expect(tl.y - bl.y).toBeCloseTo(816, 9);
    expect(tr.y).toBeCloseTo(tl.y, 9);
    expect(bl.x).toBeCloseTo(tl.x, 9);
    expect(br.x).toBeCloseTo(tr.x, 9);
    expect(br.y).toBeCloseTo(bl.y, 9);
    const b = planPointOf(cal, view, south.to);
    expect(b.x).toBeCloseTo(0, 9);
    expect(b.y).toBeCloseTo(-144, 9);
    const ne = planPointOf(cal, view, [720, 480]);
    expect(ne.x).toBeCloseTo(120, 9);
    expect(ne.y).toBeCloseTo(-144, 9);
    expect(measureIn(cal, west.from, west.to)).toBeCloseTo(west.lengthIn, 9);
  });

  it('refuses a calibration that cannot measure', () => {
    expect(calibrationOf(1, [10, 10], [10, 10], 144)).toBeNull();
    expect(calibrationOf(1, [10, 10], [10.5, 10], 144)).toBeNull();
    expect(calibrationOf(1, [10, 10], [20, 10], 0)).toBeNull();
    expect(calibrationOf(1, [10, 10], [20, 10], 2400.0625)).toBeNull();
    expect(calibrationOf(1, [10, 10], [20, 10], 1 / 3)).toBeNull();
    expect(calibrationOf(0, [10, 10], [20, 10], 144)).toBeNull();
    expect(calibrationOf(1, [Number.NaN, 10], [20, 10], 144)).toBeNull();
    expect(calibrationOf(1, [10, 10], [20, 10], 2400)).not.toBeNull();
    expect(readCalibration({ a: 1 })).toBeNull();
    expect(readCalibration(null)).toBeNull();
    expect(readCalibration({ page: 1, a: [0, 0], b: [10, 0], lengthIn: 12, extra: 1 })).toBeNull();
    expect(parseCalibrationLength('0').ok).toBe(false);
    expect(parseCalibrationLength('abc').ok).toBe(false);
  });
});

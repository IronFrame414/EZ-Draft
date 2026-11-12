// EZD-207a U2-U5 (vault/plans/EZD-207a.md section 4; Decided "View maths", "Wheel", "Grid", "Fit", "Camera"; C3).
// Model inches, +x east, +y north; region px from the top-left of the canvas region.
import { describe, expect, test } from 'vitest';
import {
  FIT_MARGIN_PX,
  GRID_MIN_PX,
  GRID_STEPS_IN,
  MAX_ZOOM_PERCENT,
  MIN_ZOOM_PERCENT,
  cameraFrame,
  clampPpi,
  fitView,
  gridStepIn,
  modelToRegion,
  panBy,
  parseZoomPercent,
  regionToModel,
  wheelZoomFactor,
  zoom100Ppi,
  zoomAt,
  zoomPercent,
} from './view';

describe('EZD-207a view maths', () => {
  test('EZD-207a U2 transforms are y-up, round-trip, and panBy moves the model opposite the pointer', () => {
    const view = { x: -24, y: 24, ppi: 8 };
    const a = modelToRegion(view, { x: 0, y: 0 });
    expect(a.x).toBeCloseTo(192, 9);
    expect(a.y).toBeCloseTo(192, 9);
    const b = modelToRegion(view, { x: 120, y: -4.5 });
    expect(b.x).toBeCloseTo(1152, 9);
    expect(b.y).toBeCloseTo(228, 9);
    for (const p of [
      { x: 0, y: 0 },
      { x: 120, y: -4.5 },
    ]) {
      const back = regionToModel(view, modelToRegion(view, p));
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
    const panned = panBy(view, 100, 50);
    expect(panned.x).toBeCloseTo(-36.5, 9);
    expect(panned.y).toBeCloseTo(30.25, 9);
    expect(panned.ppi).toBeCloseTo(8, 9);
    expect(panBy(view, Number.NaN, 0)).toBe(view);
  });

  test('EZD-207a U3 zoomAt keeps the model point under the cursor and clamps to the limits', () => {
    const start = { x: 0, y: 0, ppi: 8 / 3 };
    const at = { x: 400, y: 300 };
    expect(MIN_ZOOM_PERCENT).toBe(5);
    expect(MAX_ZOOM_PERCENT).toBe(1600);
    const zoomed = zoomAt(start, at, 2, 8 / 3);
    const m = regionToModel(zoomed, at);
    expect(m.x).toBeCloseTo(150, 9);
    expect(m.y).toBeCloseTo(-112.5, 9);
    expect(zoomed.ppi).toBeCloseTo(16 / 3, 9);
    expect(zoomAt(start, at, 1e9, 8 / 3).ppi).toBeCloseTo(128 / 3, 9);
    expect(zoomAt(start, at, 1e-9, 8 / 3).ppi).toBeCloseTo(2 / 15, 9);
    expect(zoomAt(start, at, 0, 8 / 3)).toBe(start);
    expect(zoomAt(start, at, Number.NaN, 8 / 3)).toBe(start);
  });

  test('EZD-207a U4 fitView centres the bounds inside the margin and clamps the zoom', () => {
    const region = { width: 1568, height: 862 };
    const centre = { x: 784, y: 431 };
    expect(FIT_MARGIN_PX).toBe(48);
    const first = fitView({ minX: 0, minY: -4.5, maxX: 120, maxY: 0 }, region, 8 / 3);
    expect(first.ppi).toBeCloseTo(1472 / 120, 9);
    const at = modelToRegion(first, { x: 60, y: -2.25 });
    expect(at.x).toBeCloseTo(centre.x, 9);
    expect(at.y).toBeCloseTo(centre.y, 9);

    const empty = fitView(null, region, 8 / 3);
    expect(empty.ppi).toBeCloseTo(8 / 3, 9);
    const origin = modelToRegion(empty, { x: 0, y: 0 });
    expect(origin.x).toBeCloseTo(centre.x, 9);
    expect(origin.y).toBeCloseTo(centre.y, 9);

    const point = fitView({ minX: 10, minY: 10, maxX: 10, maxY: 10 }, region, 8 / 3);
    expect(point.ppi).toBeCloseTo(8 / 3, 9);
    const p = modelToRegion(point, { x: 10, y: 10 });
    expect(p.x).toBeCloseTo(centre.x, 9);
    expect(p.y).toBeCloseTo(centre.y, 9);

    const wide = fitView({ minX: 0, minY: 0, maxX: 240, maxY: 0 }, region, 8 / 3);
    expect(wide.ppi).toBeCloseTo(1472 / 240, 9);

    const none = fitView(
      { minX: 0, minY: -4.5, maxX: 120, maxY: 0 },
      { width: 0, height: 0 },
      8 / 3,
    );
    expect(none.ppi).toBeCloseTo(2 / 15, 9);
  });

  test('EZD-207a U5 wheel factors, grid steps and the camera frame', () => {
    expect(wheelZoomFactor(100, 0, false)).toBeCloseTo(Math.exp(-0.2), 9);
    expect(wheelZoomFactor(-100, 0, false)).toBeCloseTo(Math.exp(0.2), 9);
    expect(wheelZoomFactor(10, 0, true)).toBeCloseTo(Math.exp(-0.1), 9);
    expect(wheelZoomFactor(3, 1, false)).toBeCloseTo(Math.exp(-0.096), 9);
    expect(wheelZoomFactor(1, 2, false)).toBeCloseTo(Math.exp(-1.6), 9);

    expect([...GRID_STEPS_IN]).toEqual([1, 12, 120, 1200]);
    expect(GRID_MIN_PX).toBe(16);
    expect(gridStepIn(8 / 3)).toBe(12);
    expect(gridStepIn(0.15)).toBe(120);
    expect(gridStepIn(128 / 3)).toBe(1);
    expect(gridStepIn(6)).toBe(12);
    expect(gridStepIn(1e-6)).toBe(1200);

    const frame = cameraFrame(
      { x: 0, y: 0, ppi: 8 / 3 },
      { width: 1600, height: 1000 },
      { x: 16, y: 92 },
    );
    expect(frame.centerX).toBeCloseTo(294, 9);
    expect(frame.centerY).toBeCloseTo(-153, 9);
    expect(frame.zoom).toBeCloseTo(8 / 3, 9);
    expect(frame.halfWidth).toBeCloseTo(800, 9);
    expect(frame.halfHeight).toBeCloseTo(500, 9);
  });
});

// EZD-219 U3-U5 (vault/plans/EZD-219.md section 4; 09m Scale rows 1-5, Typed zoom rows 1-7;
// Q-0664; Decided "100% zoom", "Typed zoom parse").
describe('EZD-219 zoom follows the plan scale', () => {
  test('EZD-219 U3 100% zoom per scale', () => {
    expect([0.125, 0.25, 0.5, 0.1875, 1].map((s) => zoom100Ppi(s))).toEqual([1, 2, 4, 1.5, 8]);
    expect([0.125, 0.25, 0.5, 0.1875, 1].map((s) => 120 * zoom100Ppi(s))).toEqual([
      120, 240, 480, 180, 960,
    ]);
  });

  test('EZD-219 U4 zoom limits follow the scale', () => {
    expect(clampPpi(1000, 4)).toBeCloseTo(64, 9);
    expect(clampPpi(0.01, 4)).toBeCloseTo(0.2, 9);
    expect(clampPpi(Number.NaN, 8)).toBe(8);
    expect(clampPpi(0.01, 1)).toBeCloseTo(0.05, 9);
    expect(zoomAt({ x: 0, y: 0, ppi: 8 }, { x: 400, y: 300 }, 1e9, 8).ppi).toBeCloseTo(128, 9);
    expect(fitView(null, { width: 1568, height: 862 }, 1).ppi).toBeCloseTo(1, 9);
    expect(zoomPercent(64, 4)).toBe(1600);
    expect(zoomPercent(1.32, 4)).toBe(33);
  });

  test('EZD-219 U5 typed zoom parse', () => {
    const cases: [string, number | null][] = [
      ['5', 5],
      ['1600', 1600],
      ['4', 5],
      ['2000', 1600],
      ['33.3', 33],
      ['0', 5],
      ['', null],
      ['abc', null],
      [' 250% ', 250],
      ['-5', 5],
      ['33.5', 34],
      ['1e3', null],
      ['12.5.1', null],
      ['%', null],
    ];
    for (const [text, expected] of cases) {
      expect(parseZoomPercent(text), text).toBe(expected);
    }
  });
});

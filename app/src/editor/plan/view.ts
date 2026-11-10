// EZD-207a Build step 5 (vault/plans/EZD-207a.md Decided "Zoom scale", "View maths", "Wheel", "Fit", "Grid",
// "Camera"; C3; S03 Canvas interactions; Q-0568): the plan view, pure maths, no DOM. Model inches, +x east, +y
// north; region px = CSS px from the top-left of the canvas region. `view.x, view.y` is the model point at
// region (0, 0); `ppi` is CSS px per inch.
// EZD-219 Build step 7 (vault/plans/EZD-219.md Decided "100% zoom", "Typed zoom parse"; Q-0664; 09m): 100% zoom
// follows the plan scale (96 CSS px per plan inch), the limits are 5% and 1600% of it; the typed zoom parse.
import type { Point } from '@ezdraft/geometry';

export type PlanView = { x: number; y: number; ppi: number };
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
export type Size = { width: number; height: number };
export type CameraFrame = {
  centerX: number;
  centerY: number;
  zoom: number;
  halfWidth: number;
  halfHeight: number;
};

export const MIN_ZOOM_PERCENT = 5;
export const MAX_ZOOM_PERCENT = 1600;
export const FIT_MARGIN_PX = 48;
export const GRID_STEPS_IN = [1, 12, 120, 1200] as const;
export const GRID_MIN_PX = 16;

// CSS px per model inch at 100% for a plan scale (plan inches per foot).
export function zoom100Ppi(scale: number): number {
  return (96 * scale) / 12;
}

export function zoomPercent(ppi: number, zoom100: number): number {
  return Math.round((ppi / zoom100) * 100);
}

const ZOOM_TEXT = /^-?(\d+(\.\d*)?|\.\d+)%?$/;

// Decided "Typed zoom parse": a whole percent clamped to 5..1600, or null when the text is refused.
export function parseZoomPercent(text: string): number | null {
  const trimmed = text.trim();
  if (!ZOOM_TEXT.test(trimmed)) return null;
  const value = Math.round(Number.parseFloat(trimmed));
  if (!Number.isFinite(value)) return null;
  return Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, value));
}

export function clampPpi(ppi: number, zoom100: number): number {
  if (!Number.isFinite(ppi)) return zoom100;
  return Math.min(
    (zoom100 * MAX_ZOOM_PERCENT) / 100,
    Math.max((zoom100 * MIN_ZOOM_PERCENT) / 100, ppi),
  );
}

export function regionToModel(view: PlanView, p: Point): Point {
  return { x: view.x + p.x / view.ppi, y: view.y - p.y / view.ppi };
}

export function modelToRegion(view: PlanView, p: Point): Point {
  return { x: (p.x - view.x) * view.ppi, y: (view.y - p.y) * view.ppi };
}

export function panBy(view: PlanView, dx: number, dy: number): PlanView {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return view;
  return { x: view.x - dx / view.ppi, y: view.y + dy / view.ppi, ppi: view.ppi };
}

export function zoomAt(view: PlanView, p: Point, factor: number, zoom100: number): PlanView {
  if (!Number.isFinite(factor) || factor <= 0) return view;
  const anchor = regionToModel(view, p);
  const ppi = clampPpi(view.ppi * factor, zoom100);
  return { x: anchor.x - p.x / ppi, y: anchor.y + p.y / ppi, ppi };
}

function centredOn(centre: Point, ppi: number, region: Size): PlanView {
  return { x: centre.x - region.width / 2 / ppi, y: centre.y + region.height / 2 / ppi, ppi };
}

export function fitView(bounds: Bounds | null, region: Size, zoom100: number): PlanView {
  if (
    bounds === null ||
    !Number.isFinite(bounds.minX) ||
    !Number.isFinite(bounds.minY) ||
    !Number.isFinite(bounds.maxX) ||
    !Number.isFinite(bounds.maxY)
  ) {
    return centredOn({ x: 0, y: 0 }, zoom100, region);
  }
  const bw = bounds.maxX - bounds.minX;
  const bh = bounds.maxY - bounds.minY;
  const aw = Math.max(1, region.width - 2 * FIT_MARGIN_PX);
  const ah = Math.max(1, region.height - 2 * FIT_MARGIN_PX);
  const ppi =
    bw === 0 && bh === 0
      ? zoom100
      : clampPpi(Math.min(bw > 0 ? aw / bw : Infinity, bh > 0 ? ah / bh : Infinity), zoom100);
  const centre = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  return centredOn(centre, ppi, region);
}

export function wheelZoomFactor(deltaY: number, deltaMode: number, ctrlKey: boolean): number {
  const px = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 800 : 1);
  return Math.exp(-px * (ctrlKey ? 0.01 : 0.002));
}

export function gridStepIn(ppi: number): number {
  for (const step of GRID_STEPS_IN) if (step * ppi >= GRID_MIN_PX) return step;
  return 1200;
}

export function cameraFrame(view: PlanView, canvas: Size, regionOffset: Point): CameraFrame {
  const halfWidth = canvas.width / 2;
  const halfHeight = canvas.height / 2;
  const centre = regionToModel(view, {
    x: halfWidth - regionOffset.x,
    y: halfHeight - regionOffset.y,
  });
  return { centerX: centre.x, centerY: centre.y, zoom: view.ppi, halfWidth, halfHeight };
}

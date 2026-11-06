// EZD-207a Build step 5 (vault/plans/EZD-207a.md Decided "Zoom scale", "View maths", "Wheel", "Fit", "Grid",
// "Camera"; C3; S03 Canvas interactions; Q-0568): the plan view, pure maths, no DOM. Model inches, +x east, +y
// north; region px = CSS px from the top-left of the canvas region. `view.x, view.y` is the model point at
// region (0, 0); `ppi` is CSS px per inch.
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

export const ZOOM_100_PPI = 8 / 3;
export const MIN_PPI = ZOOM_100_PPI / 20;
export const MAX_PPI = ZOOM_100_PPI * 16;
export const FIT_MARGIN_PX = 48;
export const GRID_STEPS_IN = [1, 12, 120, 1200] as const;
export const GRID_MIN_PX = 16;

export function clampPpi(ppi: number): number {
  if (!Number.isFinite(ppi)) return ZOOM_100_PPI;
  return Math.min(MAX_PPI, Math.max(MIN_PPI, ppi));
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

export function zoomAt(view: PlanView, p: Point, factor: number): PlanView {
  if (!Number.isFinite(factor) || factor <= 0) return view;
  const anchor = regionToModel(view, p);
  const ppi = clampPpi(view.ppi * factor);
  return { x: anchor.x - p.x / ppi, y: anchor.y + p.y / ppi, ppi };
}

function centredOn(centre: Point, ppi: number, region: Size): PlanView {
  return { x: centre.x - region.width / 2 / ppi, y: centre.y + region.height / 2 / ppi, ppi };
}

export function fitView(bounds: Bounds | null, region: Size): PlanView {
  if (
    bounds === null ||
    !Number.isFinite(bounds.minX) ||
    !Number.isFinite(bounds.minY) ||
    !Number.isFinite(bounds.maxX) ||
    !Number.isFinite(bounds.maxY)
  ) {
    return centredOn({ x: 0, y: 0 }, ZOOM_100_PPI, region);
  }
  const bw = bounds.maxX - bounds.minX;
  const bh = bounds.maxY - bounds.minY;
  const aw = Math.max(1, region.width - 2 * FIT_MARGIN_PX);
  const ah = Math.max(1, region.height - 2 * FIT_MARGIN_PX);
  const ppi =
    bw === 0 && bh === 0
      ? ZOOM_100_PPI
      : clampPpi(Math.min(bw > 0 ? aw / bw : Infinity, bh > 0 ? ah / bh : Infinity));
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

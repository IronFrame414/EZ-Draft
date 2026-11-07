// Tool overlay (EZD-210b; vault/plans/EZD-210b.md section 3 C1-C4, Decided "Overlay shapes", "Overlay writes";
// Q-0589 (a); 11 rule 4): the rubber band and the snap marker as SVG path data in canvas-region px, written
// straight onto the elements on pointer moves and camera changes. No React.
import type { Point, SnapKind } from '@ezdraft/geometry';
import type { DrawingFrame } from './drawing-controller';
import type { SnapMarkerShape } from './snap-marker';

export type OverlayElement = {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
};

export type OverlayShapes = {
  band: string | null;
  marker: { kind: SnapKind; shape: SnapMarkerShape; d: string } | null;
};

const n = (v: number): string => String(Math.round(v * 10) / 10);
const xy = (p: Point): string => `${n(p.x)} ${n(p.y)}`;
const add = (p: Point, u: Point, k: number): Point => ({ x: p.x + u.x * k, y: p.y + u.y * k });

function unit(v: Point): Point {
  const len = Math.hypot(v.x, v.y);
  return len > 0 ? { x: v.x / len, y: v.y / len } : { x: 1, y: 0 };
}

// The screen direction of a model direction; `(1, 0)` when there is none.
function screenUnit(dir: Point | null, toScreen: (p: Point) => Point): Point {
  if (dir === null) return { x: 1, y: 0 };
  const o = toScreen({ x: 0, y: 0 });
  const d = toScreen(dir);
  return unit({ x: d.x - o.x, y: d.y - o.y });
}

function markerPath(frame: DrawingFrame, toScreen: (p: Point) => Point): string | null {
  const m = frame.marker;
  if (m === null) return null;
  const s = toScreen(m.at);
  const at = (dx: number, dy: number) => xy({ x: s.x + dx, y: s.y + dy });
  switch (m.shape) {
    case 'square':
      return `M ${at(-5, -5)} L ${at(5, -5)} L ${at(5, 5)} L ${at(-5, 5)} Z`;
    case 'triangle':
      return `M ${at(0, -6)} L ${at(5, 3)} L ${at(-5, 3)} Z`;
    case 'cross':
      return `M ${at(-4, 0)} L ${at(4, 0)} M ${at(0, -4)} L ${at(0, 4)}`;
    case 'bar': {
      const u = screenUnit(frame.wallDirection, toScreen);
      return `M ${xy(add(s, u, -6))} L ${xy(add(s, u, 6))}`;
    }
    case 'arc': {
      const c = frame.anchor === null ? s : toScreen(frame.anchor);
      const u0 = screenUnit(frame.referenceDirection, toScreen);
      const u1 = frame.anchor === null ? u0 : unit({ x: s.x - c.x, y: s.y - c.y });
      const deg = m.angleDeg;
      if (deg !== null && deg > 0 && deg < 180) {
        const f = u0.x * u1.y - u0.y * u1.x > 0 ? 1 : 0;
        return `M ${xy(add(c, u0, 16))} A 16 16 0 0 ${f} ${xy(add(c, u1, 16))}`;
      }
      return `M ${xy(c)} L ${xy(add(c, u1, 16))}`;
    }
  }
}

export function overlayShapes(
  frame: DrawingFrame | null,
  toScreen: (p: Point) => Point,
): OverlayShapes {
  if (frame === null) return { band: null, marker: null };
  let band: string | null = null;
  if (frame.from !== null && frame.to !== null) {
    const a = toScreen(frame.from);
    const b = toScreen(frame.to);
    band = frame.rect
      ? `M ${n(a.x)} ${n(a.y)} L ${n(b.x)} ${n(a.y)} L ${n(b.x)} ${n(b.y)} L ${n(a.x)} ${n(b.y)} Z`
      : `M ${xy(a)} L ${xy(b)}`;
  }
  const d = markerPath(frame, toScreen);
  const marker =
    d === null || frame.marker === null
      ? null
      : { kind: frame.marker.kind, shape: frame.marker.shape, d };
  return { band, marker };
}

export function createToolOverlay(
  els: { band: OverlayElement; marker: OverlayElement },
  toScreen: (p: Point) => Point,
): { draw(frame: DrawingFrame | null): void } {
  return {
    draw(frame) {
      const shapes = overlayShapes(frame, toScreen);
      if (shapes.band === null) {
        els.band.setAttribute('display', 'none');
      } else {
        els.band.removeAttribute('display');
        els.band.setAttribute('d', shapes.band);
      }
      if (shapes.marker === null) {
        els.marker.setAttribute('display', 'none');
        els.marker.removeAttribute('data-snap-kind');
        els.marker.removeAttribute('data-shape');
      } else {
        els.marker.setAttribute('d', shapes.marker.d);
        els.marker.setAttribute('data-snap-kind', shapes.marker.kind);
        els.marker.setAttribute('data-shape', shapes.marker.shape);
        els.marker.removeAttribute('display');
      }
    },
  };
}

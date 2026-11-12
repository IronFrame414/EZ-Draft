// Tool overlay (EZD-210b; vault/plans/EZD-210b.md section 3 C1-C4, Decided "Overlay shapes", "Overlay writes";
// Q-0589 (a); 11 rule 4): the rubber band and the snap marker as SVG path data in canvas-region px, written
// straight onto the elements on pointer moves and camera changes. No React.
// EZD-211b: opening preview, dims, ticks, chips, hinge dot (vault/plans/EZD-211b.md Decided "openingOverlay",
// "Overlay writes").
// EZD-212b (vault/plans/EZD-212b.md D9): the dashed Move preview path.
import {
  doorSymbol,
  formatLength,
  openingSpan,
  PLAN_DISPLAY_DENOMINATOR,
  wallFaceLines,
  type OpeningObject,
  type PickShape,
  type Point,
  type SnapKind,
} from '@ezdraft/geometry';
import type { DrawingFrame, OpeningFrame } from './drawing-controller';
import type { SnapMarkerShape } from './snap-marker';

export type OverlayElement = {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
};

export type OverlayShapes = {
  band: string | null;
  marker: { kind: SnapKind; shape: SnapMarkerShape; d: string } | null;
};

export type ChipPlace = { x: number; y: number; text: string };

export type OpeningShapes = {
  span: string;
  leaf: string | null;
  arc: string | null;
  dims: string;
  ticks: string;
  left: ChipPlace | null;
  right: ChipPlace | null;
  dot: Point | null;
};

export type ChipElements = {
  slot: { style: { transform: string; display: string } };
  button: { textContent: string | null };
};

export type OpeningElements = {
  group: OverlayElement;
  span: OverlayElement;
  leaf: OverlayElement;
  arc: OverlayElement;
  dims: OverlayElement;
  ticks: OverlayElement;
  dot: OverlayElement;
  chips: readonly [ChipElements, ChipElements];
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

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });

export function openingOverlay(
  frame: OpeningFrame,
  toScreen: (p: Point) => Point,
): OpeningShapes | null {
  const offsets = frame.offsets;
  if (offsets === null) return null;
  const host = frame.host;
  const { start, end } = host.data.geometry;
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const d = { x: (end.x - start.x) / length, y: (end.y - start.y) / length };
  const P = (s: number): Point => add(start, d, s);
  const object: OpeningObject = { id: '', type: 'opening', data: frame.data };
  const span = openingSpan(object, host);
  if (span === null) return null;
  const c = frame.data.geometry.center;
  const nm = frame.chipSide === 'left' ? { x: -d.y, y: d.x } : { x: d.y, y: -d.x };
  const u = unit(sub(toScreen(add(c, nm, 1)), toScreen(c)));

  let spanPath = '';
  if (!frame.owned) {
    const faces = wallFaceLines(host.data);
    const on = (line: { start: Point; end: Point }, s: number): Point =>
      toScreen(add(line.start, d, s));
    spanPath =
      `M ${xy(on(faces.left, span.lo))} L ${xy(on(faces.left, span.hi))} ` +
      `L ${xy(on(faces.right, span.hi))} L ${xy(on(faces.right, span.lo))} Z`;
  }

  const sym = frame.data.attributes.kind === 'door' ? doorSymbol(object, host) : null;
  let leaf: string | null = null;
  let arc: string | null = null;
  if (sym !== null && !frame.owned) {
    const H = toScreen(sym.hinge);
    const E = toScreen(sym.leafEnd);
    const onCircle = (deg: number): Point =>
      toScreen({
        x: sym.hinge.x + sym.radius * Math.cos((deg * Math.PI) / 180),
        y: sym.hinge.y + sym.radius * Math.sin((deg * Math.PI) / 180),
      });
    const a0 = onCircle(sym.startAngle);
    const a1 = onCircle(sym.endAngle);
    const far = (p: Point) => Math.hypot(p.x - E.x, p.y - E.y);
    const C = far(a0) >= far(a1) ? a0 : a1;
    const edge = toScreen({ x: sym.hinge.x + sym.radius, y: sym.hinge.y });
    const r = Math.hypot(edge.x - H.x, edge.y - H.y);
    const f = (C.x - H.x) * (E.y - H.y) - (C.y - H.y) * (E.x - H.x) > 0 ? 1 : 0;
    leaf = `M ${xy(H)} L ${xy(E)}`;
    arc = `M ${xy(C)} A ${n(r)} ${n(r)} 0 0 ${f} ${xy(E)}`;
  }

  let dims = '';
  let ticks = '';
  let left: ChipPlace | null = null;
  let right: ChipPlace | null = null;
  if (frame.chips) {
    const dimParts: string[] = [];
    const tickParts: string[] = [];
    const side = (corner: { at: number }, offset: number): ChipPlace => {
      const near =
        Math.abs(span.lo - corner.at) <= Math.abs(span.hi - corner.at) ? span.lo : span.hi;
      const K = add(toScreen(P(corner.at)), u, 36);
      const e = add(toScreen(P(near)), u, 36);
      dimParts.push(`M ${xy(K)} L ${xy(e)}`);
      for (const q of [K, e]) tickParts.push(`M ${xy(add(q, u, -8))} L ${xy(add(q, u, 8))}`);
      return {
        x: (K.x + e.x) / 2,
        y: (K.y + e.y) / 2,
        text: formatLength(offset, PLAN_DISPLAY_DENOMINATOR),
      };
    };
    left = side(offsets.leftCorner, offsets.left);
    right = side(offsets.rightCorner, offsets.right);
    dims = dimParts.join(' ');
    ticks = tickParts.join(' ');
  }

  const dot = frame.dot && sym !== null ? toScreen(sym.hinge) : null;
  return { span: spanPath, leaf, arc, dims, ticks, left, right, dot };
}

function showPath(el: OverlayElement, d: string | null): void {
  if (d === null || d === '') {
    el.setAttribute('display', 'none');
    return;
  }
  el.removeAttribute('display');
  el.setAttribute('d', d);
}

function showChip(el: ChipElements, place: ChipPlace | null): void {
  if (place === null) {
    el.slot.style.display = 'none';
    return;
  }
  el.slot.style.display = '';
  el.slot.style.transform = `translate(${n(place.x)}px, ${n(place.y)}px) translate(-50%, -50%)`;
  el.button.textContent = place.text;
}

function drawOpening(
  els: OpeningElements,
  frame: DrawingFrame | null,
  toScreen: (p: Point) => Point,
): void {
  const shapes =
    frame === null || frame.opening === null ? null : openingOverlay(frame.opening, toScreen);
  if (shapes === null) {
    for (const el of [els.group, els.dims, els.ticks, els.dot]) el.setAttribute('display', 'none');
    for (const chip of els.chips) chip.slot.style.display = 'none';
    return;
  }
  if (shapes.span === '' && shapes.leaf === null && shapes.arc === null) {
    els.group.setAttribute('display', 'none');
  } else {
    els.group.removeAttribute('display');
  }
  showPath(els.span, shapes.span);
  showPath(els.leaf, shapes.leaf);
  showPath(els.arc, shapes.arc);
  showPath(els.dims, shapes.dims);
  showPath(els.ticks, shapes.ticks);
  if (shapes.dot === null) {
    els.dot.setAttribute('display', 'none');
  } else {
    els.dot.removeAttribute('display');
    els.dot.setAttribute('cx', n(shapes.dot.x));
    els.dot.setAttribute('cy', n(shapes.dot.y));
  }
  showChip(els.chips[0], shapes.left);
  showChip(els.chips[1], shapes.right);
}

export function previewPath(
  shapes: readonly PickShape[],
  toScreen: (p: Point) => Point,
): string | null {
  if (shapes.length === 0) return null;
  return shapes
    .map((s) =>
      s.kind === 'quad'
        ? `M ${s.points.map((q) => xy(toScreen(q))).join(' L ')} Z`
        : `M ${xy(toScreen(s.from))} L ${xy(toScreen(s.to))}`,
    )
    .join(' ');
}

export function createToolOverlay(
  els: {
    band: OverlayElement;
    marker: OverlayElement;
    opening?: OpeningElements;
    preview?: OverlayElement;
  },
  toScreen: (p: Point) => Point,
): { draw(frame: DrawingFrame | null): void } {
  return {
    draw(frame) {
      if (els.opening !== undefined) drawOpening(els.opening, frame, toScreen);
      if (els.preview !== undefined) {
        const d = previewPath(frame?.preview ?? [], toScreen);
        if (d === null) {
          els.preview.setAttribute('display', 'none');
        } else {
          els.preview.setAttribute('d', d);
          els.preview.removeAttribute('display');
        }
      }
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

// EZD-216 (S03 rail Dimension, Text; board S03Plan dimensions: a line with end ticks 16 px long at 14 px text, the text
// centred on a canvas-coloured gap; 09h "typed-override dimensions underlined"; 09-calculations Q-0664 "Text paper
// sizes"; Q-0687 (b) notes of several lines): the drawing items of a stored dimension or note. Pure.
//
// Sizes: text is a paper size (paper inches). `paperPtPerIn` turns it into the item's `sizePt` (72 on a sheet, where
// a point is a printed point; the plan's own value makes the text that paper size at its scale), and
// `modelInPerPt` turns points into model inches for the gap, ticks, underline and arrowhead.
import { measureTextPt, DRAWING_FONTS } from '../drawing/text';
import type { DrawingItem, DrawingLayer } from '../drawing/types';
import {
  DIMENSION_PAPER_SIZE,
  PAPER_SIZE_IN,
  type DimensionData,
  type Point,
  type TextData,
} from '../schema';
import { add, sub } from '../vec';
import {
  dimensionLine,
  dimensionText,
  type DimensionMeasure,
  type DimensionObject,
} from './measure';

export type TextObject = { id: string; type: 'text'; data: TextData };

export type AnnotationScale = { paperPtPerIn: number; modelInPerPt: number };

/** A sheet: a point is a printed point, at the 1/4" = 1'-0" sheet scale (vault/build/assumptions.md EZD-216). */
export const SHEET_ANNOTATION_SCALE: AnnotationScale = { paperPtPerIn: 72, modelInPerPt: 12 / (72 * 0.25) };

/** Board S03Plan: end ticks 16 px long at 14 px text, so each side is 4/7 of the text size. */
export const TICK_HALF_EM = 4 / 7;
/** The clear space each side of the text in the line's gap. */
export const GAP_PAD_EM = 0.25;
/** The underline under override text, below the text's middle. */
export const UNDERLINE_EM = 0.6;
/** A note's line spacing. */
export const LINE_HEIGHT_EM = 1.25;
/** The leader's arrowhead: its sides' length and their angle off the leader. */
export const ARROW_EM = 0.8;
export const ARROW_DEG = 20;

const FONT = 'dm-mono-400' as const;

const unitOf = (v: Point): Point => {
  const l = Math.hypot(v.x, v.y);
  return l > 0 ? { x: v.x / l, y: v.y / l } : { x: 1, y: 0 };
};

// Reading direction never upside down (as the drawing list's other dimension text).
function readingDeg(d: Point): number {
  let deg = (Math.atan2(d.y, d.x) * 180) / Math.PI;
  if (deg <= -90) deg += 180;
  else if (deg > 90) deg -= 180;
  return deg;
}

function textItem(
  layer: DrawingLayer,
  objectId: string,
  text: string,
  sizePt: number,
  at: Point,
  rotationDeg: number,
): DrawingItem {
  return {
    kind: 'text',
    layer,
    objectId,
    text,
    font: FONT,
    sizePt,
    widthPt: measureTextPt(DRAWING_FONTS[FONT], text, sizePt),
    at,
    rotationDeg,
    align: 'center',
  };
}

const line = (layer: DrawingLayer, objectId: string, from: Point, to: Point): DrawingItem => ({
  kind: 'line',
  role: 'dimension',
  layer,
  objectId,
  from,
  to,
});

function underline(
  objectId: string,
  at: Point,
  rotationDeg: number,
  widthIn: number,
  em: number,
): DrawingItem {
  const a = (rotationDeg * Math.PI) / 180;
  const along = { x: Math.cos(a), y: Math.sin(a) };
  const down = { x: Math.sin(a), y: -Math.cos(a) };
  const mid = add(at, down, UNDERLINE_EM * em);
  return line('dimensions', objectId, add(mid, along, -widthIn / 2), add(mid, along, widthIn / 2));
}

/** A dimension's items on the `dimensions` layer: extension lines, the line or arc, end ticks and its text. */
export function dimensionItems(
  d: DimensionObject,
  m: DimensionMeasure,
  scale: AnnotationScale,
): DrawingItem[] {
  const data: DimensionData = d.data;
  const sizePt = PAPER_SIZE_IN[DIMENSION_PAPER_SIZE] * scale.paperPtPerIn;
  const em = sizePt * scale.modelInPerPt;
  const text = dimensionText(data, m);
  const widthIn = measureTextPt(DRAWING_FONTS[FONT], text, sizePt) * scale.modelInPerPt;
  const out: DrawingItem[] = [];
  const id = d.id;
  const overridden = data.attributes.override !== null;

  if (m.kind === 'angular') {
    const { vertex, radius, startDeg, endDeg } = m;
    const dir = (deg: number) => ({
      x: Math.cos((deg * Math.PI) / 180),
      y: Math.sin((deg * Math.PI) / 180),
    });
    out.push(line('dimensions', id, vertex, add(vertex, dir(startDeg), radius)));
    out.push(line('dimensions', id, vertex, add(vertex, dir(endDeg), radius)));
    out.push({
      kind: 'arc',
      role: 'dimension',
      layer: 'dimensions',
      objectId: id,
      center: vertex,
      radius,
      startAngle: startDeg,
      endAngle: endDeg,
    });
    let sweep = endDeg - startDeg;
    if (sweep < 0) sweep += 360;
    const at = add(vertex, dir(startDeg + sweep / 2), radius + em);
    out.push(textItem('dimensions', id, text, sizePt, at, 0));
    if (overridden) out.push(underline(id, at, 0, widthIn, em));
    return out;
  }

  const offset = data.attributes.offset;
  const ends = dimensionLine(m, offset);
  const dir = unitOf(sub(ends.to, ends.from));
  // Extension lines from what is measured out to the line, when the line is off it.
  if (Math.abs(offset) > 0) {
    out.push(line('dimensions', id, m.from, ends.from));
    out.push(line('dimensions', id, m.to, ends.to));
  }
  // The line, broken for its text when the text fits between the ends; else whole, with the text beside it.
  const mid = { x: (ends.from.x + ends.to.x) / 2, y: (ends.from.y + ends.to.y) / 2 };
  const half = widthIn / 2 + GAP_PAD_EM * em;
  const rotationDeg = readingDeg(dir);
  let at = mid;
  if (2 * half < m.length) {
    out.push(line('dimensions', id, ends.from, add(mid, dir, -half)));
    out.push(line('dimensions', id, add(mid, dir, half), ends.to));
  } else {
    out.push(line('dimensions', id, ends.from, ends.to));
    at = add(mid, m.normal, em);
  }
  // End ticks across the line (board S03Plan).
  for (const p of [ends.from, ends.to])
    out.push(line('dimensions', id, add(p, m.normal, -TICK_HALF_EM * em), add(p, m.normal, TICK_HALF_EM * em)));
  out.push(textItem('dimensions', id, text, sizePt, at, rotationDeg));
  if (overridden) out.push(underline(id, at, rotationDeg, widthIn, em));
  return out;
}

/** The box a note's lines take, in model inches (its first line's middle at `position`). */
export function textBlock(
  t: TextData,
  scale: AnnotationScale,
): { lines: string[]; sizePt: number; em: number; widthIn: number; box: { minX: number; minY: number; maxX: number; maxY: number } } {
  const sizePt = PAPER_SIZE_IN[t.attributes.paperSize] * scale.paperPtPerIn;
  const em = sizePt * scale.modelInPerPt;
  const lines = t.attributes.text.split('\n');
  const widthIn = Math.max(
    ...lines.map((l) => measureTextPt(DRAWING_FONTS[FONT], l, sizePt) * scale.modelInPerPt),
  );
  const p = t.geometry.position;
  const lh = LINE_HEIGHT_EM * em;
  return {
    lines,
    sizePt,
    em,
    widthIn,
    box: {
      minX: p.x - widthIn / 2,
      maxX: p.x + widthIn / 2,
      maxY: p.y + lh / 2,
      minY: p.y - lh / 2 - lh * (lines.length - 1),
    },
  };
}

// Where the ray from the box centre toward `p` leaves the box.
function boxExit(box: { minX: number; minY: number; maxX: number; maxY: number }, p: Point): Point {
  const c = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  const v = sub(p, c);
  const hx = (box.maxX - box.minX) / 2;
  const hy = (box.maxY - box.minY) / 2;
  const k = Math.min(
    v.x === 0 ? Infinity : hx / Math.abs(v.x),
    v.y === 0 ? Infinity : hy / Math.abs(v.y),
  );
  return k >= 1 ? p : add(c, v, k);
}

/** A note's items on its status layer: one text item per line, one under the other, and its leader. */
export function textItems(t: TextObject, scale: AnnotationScale): DrawingItem[] {
  const layer: DrawingLayer = t.data.status;
  const b = textBlock(t.data, scale);
  const p = t.data.geometry.position;
  const lh = LINE_HEIGHT_EM * b.em;
  const out: DrawingItem[] = b.lines.map((l, i) =>
    textItem(layer, t.id, l, b.sizePt, { x: p.x, y: p.y - i * lh }, 0),
  );
  const end = t.data.geometry.leader;
  if (end !== null) {
    const from = boxExit(b.box, end);
    const v = sub(from, end);
    if (Math.hypot(v.x, v.y) > 0) {
      out.push(line(layer, t.id, from, end));
      const u = unitOf(v);
      const r = (ARROW_DEG * Math.PI) / 180;
      for (const s of [1, -1]) {
        const side = {
          x: u.x * Math.cos(r * s) - u.y * Math.sin(r * s),
          y: u.x * Math.sin(r * s) + u.y * Math.cos(r * s),
        };
        out.push(line(layer, t.id, end, add(end, side, ARROW_EM * b.em)));
      }
    }
  }
  return out.filter((i) => i.kind !== 'text' || i.text.length > 0);
}

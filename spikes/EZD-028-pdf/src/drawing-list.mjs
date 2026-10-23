// EZD-028 hard-coded room as a drawing list (vault/plans/EZD-028.md Steps 1-2; R26 R7).
// No DOM and no PDFKit import. Geometry is in model inches, y up; angles in degrees,
// counter-clockwise from +x. The shape is provisional; EZD-238 defines the real one.
import { textWidth } from './metrics.mjs';

/**
 * @typedef {[number, number]} Point
 * @typedef {{ kind: string, role: string, layer: string, weight: number } & Record<string, unknown>} Item
 * @typedef {{ scale: number, paperSize: [number, number], paperOrigin: [number, number] }} View
 */

// Step 2 view: 1/4" = 1'-0" (09 Sheet set rules), 36 x 24 in at 72 pt/in, room centred on the page.
/** @type {View} */
const VIEW = { scale: 1 / 48, paperSize: [2592, 1728], paperOrigin: [1188, 774] };

// Step 1 placeholder stroke widths in pt (spike inputs, not decisions).
const WEIGHT = { wall: 1.5, door: 0.5, hatch: 0.25, 'check-dimension': 0.25 };

// Step 2: all text at 6.75 pt (3/32 in, the 09 minimum on 24x36).
const TEXT_SIZE = 6.75;

// Step 1 room interior (0,0)-(144,120); hatch at 45 deg, 6 in perpendicular spacing through (0,0).
const ROOM = { x0: 0, y0: 0, x1: 144, y1: 120 };
const HATCH_SPACING = 6;

/** @param {string} role @param {Record<string, unknown>} fields @returns {Item} */
function item(kind, role, fields) {
  return { kind, role, layer: role, weight: kind === 'text' ? 0 : WEIGHT[role], ...fields };
}

/** @param {'sans' | 'mono'} font */
function text(role, value, font, anchor, align) {
  return item('text', role, {
    text: value,
    font,
    size: TEXT_SIZE,
    width: textWidth(font, value, TEXT_SIZE),
    anchor,
    align,
  });
}

/**
 * Lines x - y = c through the room rectangle, clipped to it. c = k * spacing * sqrt(2) for every
 * integer k with y0 - y1 < c < x1 - x0 (the line touches the rectangle in more than a corner).
 * @returns {{ from: Point, to: Point }[]}
 */
function hatchSegments() {
  const step = HATCH_SPACING * Math.SQRT2;
  const cMin = ROOM.x0 - ROOM.y1;
  const cMax = ROOM.x1 - ROOM.y0;
  const segments = [];
  for (let k = Math.floor(cMin / step) + 1; k * step < cMax; k++) {
    const c = k * step;
    const yStart = Math.max(ROOM.y0, ROOM.x0 - c);
    const yEnd = Math.min(ROOM.y1, ROOM.x1 - c);
    segments.push({ from: [yStart + c, yStart], to: [yEnd + c, yEnd] });
  }
  return segments;
}

/** @returns {{ view: View, items: Item[] }} the 12 items of Step 2, in order. */
export function buildRoomList() {
  return {
    view: { ...VIEW },
    items: [
      item('polyline', 'wall', {
        points: [
          [48, 0],
          [144, 0],
          [144, 120],
          [0, 120],
          [0, 0],
          [12, 0],
        ],
        closed: false,
      }),
      item('line', 'door', { from: [12, 0], to: [12, 36] }),
      item('arc', 'door', { center: [12, 0], radius: 36, startAngle: 0, endAngle: 90 }),
      item('hatch', 'hatch', {
        boundary: [
          [ROOM.x0, ROOM.y0],
          [ROOM.x1, ROOM.y0],
          [ROOM.x1, ROOM.y1],
          [ROOM.x0, ROOM.y1],
        ],
        segments: hatchSegments(),
      }),
      item('line', 'check-dimension', { from: [0, -24], to: [144, -24] }),
      item('line', 'check-dimension', { from: [0, -2], to: [0, -26] }),
      item('line', 'check-dimension', { from: [144, -2], to: [144, -26] }),
      item('line', 'check-dimension', { from: [-2, -26], to: [2, -22] }),
      item('line', 'check-dimension', { from: [142, -26], to: [146, -22] }),
      text('check-dimension', `12'-0"`, 'mono', [72, -22], 'center'),
      text('room-label', 'EZD-028 ROOM', 'sans', [72, 60], 'center'),
      text('scale-label', `1/4" = 1'-0"`, 'mono', [72, -32], 'center'),
    ],
  };
}

/**
 * Step 5 stress list: 150,000 straight segments on one 24x36 page (11 Budgets reference DXF size).
 * A deterministic fan of short lines over the page, in model inches at the same view.
 * @returns {{ view: View, items: Item[] }}
 */
export function buildStressList(count = 150_000) {
  const toModel = 1 / (VIEW.scale * 72);
  const [w, h] = VIEW.paperSize;
  const cols = 500;
  const rows = Math.ceil(count / cols);
  const items = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = ((col + 0.5) * (w / cols) - VIEW.paperOrigin[0]) * toModel;
    const y = ((row + 0.5) * (h / rows) - VIEW.paperOrigin[1]) * toModel;
    const t = (i * 37) % 360;
    const r = 2;
    const dx = r * Math.cos((t * Math.PI) / 180);
    const dy = r * Math.sin((t * Math.PI) / 180);
    items.push(item('line', 'wall', { from: [x - dx, y - dy], to: [x + dx, y + dy] }));
  }
  return { view: { ...VIEW }, items };
}

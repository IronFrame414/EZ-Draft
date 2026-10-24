// EZD-016b Step 4.4 (vault/plans/EZD-016b.md): the plan drawn on the same paper layout at 150 px per
// inch, 8-bit greyscale, white 255, black 0. Pixel mapping: column = X * 150 / 72, row from the top =
// (792 - Y) * 150 / 72 (pixel centres at whole numbers). Walls 3 px wide; door, swing and window 1 px;
// the arc is sampled densely enough to leave no gaps. No noise, no skew: deterministic.
import { planDrawing } from './plan-drawing.mjs';
import { PAPER, toPaper } from './write-pdf.mjs';

export const PX_PER_INCH = 150;
export const WALL_PX = 3;
export const OTHER_PX = 1;
const ARC_SEGMENTS = 512;

/**
 * @param {import('./room.mjs').Room} room
 * @returns {{ width: number, height: number, data: Uint8Array }}
 */
export function rasterizePlan(room) {
  const width = (PAPER.width / 72) * PX_PER_INCH;
  const height = (PAPER.height / 72) * PX_PER_INCH;
  const data = new Uint8Array(width * height).fill(255);
  /** @param {number} x @param {number} y */
  const px = (x, y) => {
    const [X, Y] = toPaper(x, y);
    return [(X * PX_PER_INCH) / 72, ((PAPER.height - Y) * PX_PER_INCH) / 72];
  };

  /** Pixels whose centre is within w/2 of the segment become black. */
  const segment = (/** @type {number[]} */ a, /** @type {number[]} */ b, /** @type {number} */ w) => {
    const h = w / 2;
    const c0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - h));
    const c1 = Math.min(width - 1, Math.ceil(Math.max(a[0], b[0]) + h));
    const r0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - h));
    const r1 = Math.min(height - 1, Math.ceil(Math.max(a[1], b[1]) + h));
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        let t = len2 === 0 ? 0 : ((c - a[0]) * dx + (r - a[1]) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const ex = a[0] + t * dx - c;
        const ey = a[1] + t * dy - r;
        if (ex * ex + ey * ey <= h * h) data[r * width + c] = 0;
      }
    }
  };

  for (const p of planDrawing(room).primitives) {
    const w = p.layer === 'WALLS' ? WALL_PX : OTHER_PX;
    if (p.type === 'line') {
      segment(px(...p.a), px(...p.b), w);
    } else if (p.type === 'arc') {
      const s = (p.startDeg * Math.PI) / 180;
      const e = (p.endDeg * Math.PI) / 180;
      let prev = null;
      for (let i = 0; i <= ARC_SEGMENTS; i++) {
        const t = s + ((e - s) * i) / ARC_SEGMENTS;
        const pt = px(p.center[0] + p.radius * Math.cos(t), p.center[1] + p.radius * Math.sin(t));
        if (prev) segment(prev, pt, w);
        prev = pt;
      }
    }
  }
  return { width, height, data };
}

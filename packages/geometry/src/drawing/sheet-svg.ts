// EZD-702b (S13 Layout "sheet preview"; 09h Sheet set rules "Scales per viewport: 1/4\" = 1'-0\" plans", "Text prints
// at fixed paper sizes at any scale", "Line weights by role: cut heavy, beyond light, hidden dashed, dims and leaders
// thinnest"; 11 rule 3 "sheet SVG building ... run in Web Workers"; R7 one drawing list feeds the plan, the on-screen
// sheet and the PDF): one drawing list as SVG markup on a sheet, in paper inches with y down, for the sheet worker.
// The pen widths and colours are vault/build/assumptions.md EZD-702b. No DOM.
import type { Point } from '../schema';
import type { DrawingItem, DrawingLayer, DrawingList, LineWeightRole } from './types';

// 1/4" = 1'-0": a quarter paper inch per 12 model inches.
export const QUARTER_INCH_SCALE = 0.25 / 12;

// Pen widths in paper inches. EZD-705 (vault/build/assumptions/EZD-705.md, settled "Line weights by role"; board
// S10Detail line roles): cut 0.50 mm, beyond 0.18 mm, hidden 0.25 mm dashed, dimensions and leaders 0.13 mm, at every
// scale.
export const SHEET_PEN_IN: Readonly<Record<LineWeightRole, number>> = {
  cut: 0.5 / 25.4,
  beyond: 0.18 / 25.4,
  hidden: 0.25 / 25.4,
  dimension: 0.13 / 25.4,
};
// EZD-705 (09h "Text prints at fixed paper sizes at any scale: minimum 3/32\" on 24×36"): no sheet text prints
// smaller than 3/32" (6.75 pt).
export const SHEET_TEXT_MIN_PT = (3 / 32) * 72;
// The hidden role's dash and gap in paper inches.
export const SHEET_HIDDEN_DASH_IN: readonly [number, number] = [1 / 16, 1 / 32];

const INK = '#000000';
const POCHE = '#c8c8c8';
const FONT_FAMILY: Record<string, string> = {
  'dm-mono-400': "'DM Mono', monospace",
  'instrument-sans-600': "'Instrument Sans', sans-serif",
};
// EZD-703 (A2.0 Demo; vault/build/assumptions/EZD-703.md): what is removed is drawn dashed with no poché, so the
// demo plan tells it from what stays.
const FILLED: ReadonlySet<DrawingLayer> = new Set(['existing', 'new']);

// The paper rectangle the drawing is centred in, paper inches from the top-left corner.
export type SheetArea = { x: number; y: number; width: number; height: number };

export type SheetSvgOptions = {
  // Paper inches per model inch (QUARTER_INCH_SCALE for a plan).
  scale: number;
  area: SheetArea;
};

export type SheetSvg = {
  // The items as SVG elements, to sit inside an <svg> whose user unit is one paper inch.
  markup: string;
  // The ids of the objects the drawing shows, ascending.
  shown: string[];
};

// XML text and attribute escaping: room names are typed by users.
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const num = (n: number): string => {
  const r = Math.round(n * 1e5) / 1e5;
  return Object.is(r, -0) ? '0' : String(r);
};

function itemPoints(item: DrawingItem): Point[] {
  switch (item.kind) {
    case 'line':
      return [item.from, item.to];
    case 'arc':
      return [
        { x: item.center.x - item.radius, y: item.center.y - item.radius },
        { x: item.center.x + item.radius, y: item.center.y + item.radius },
      ];
    case 'fill':
      return item.points;
    case 'hatch':
      return item.boundary;
    case 'text':
      return [item.at];
  }
}

// The model bounds of the list, or null when it has no items.
export function drawingListBounds(
  list: DrawingList,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const item of list.items) {
    for (const p of itemPoints(item)) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

function stroke(role: LineWeightRole, layer?: DrawingLayer): string {
  const dash =
    role === 'hidden' || layer === 'demo'
      ? ` stroke-dasharray="${num(SHEET_HIDDEN_DASH_IN[0])} ${num(SHEET_HIDDEN_DASH_IN[1])}"`
      : '';
  return `fill="none" stroke="${INK}" stroke-width="${num(SHEET_PEN_IN[role])}" stroke-linecap="round"${dash}`;
}

const tags = (item: DrawingItem, role: LineWeightRole | null): string =>
  ` data-object-id="${escapeXml(item.objectId)}" data-layer="${item.layer}"` +
  (role === null ? '' : ` data-role="${role}"`);

export function sheetSvg(list: DrawingList, options: SheetSvgOptions): SheetSvg {
  const { scale, area } = options;
  const shown = [...new Set(list.items.map((i) => i.objectId))].sort();
  const bounds = drawingListBounds(list);
  if (bounds === null) return { markup: '', shown };
  // The drawing's centre goes to the area's centre; model y up becomes paper y down.
  const mx = (bounds.minX + bounds.maxX) / 2;
  const my = (bounds.minY + bounds.maxY) / 2;
  const cx = area.x + area.width / 2;
  const cy = area.y + area.height / 2;
  const X = (p: Point) => num(cx + (p.x - mx) * scale);
  const Y = (p: Point) => num(cy - (p.y - my) * scale);
  const xy = (p: Point) => `${X(p)} ${Y(p)}`;

  const out: string[] = [];
  for (const item of list.items) {
    if (item.kind === 'line') {
      out.push(
        `<line x1="${X(item.from)}" y1="${Y(item.from)}" x2="${X(item.to)}" y2="${Y(item.to)}" ${stroke(item.role, item.layer)}${tags(item, item.role)}/>`,
      );
    } else if (item.kind === 'arc') {
      let sweep = item.endAngle - item.startAngle;
      if (sweep <= 0) sweep += 360;
      const r = item.radius;
      const pointAt = (deg: number): Point => ({
        x: item.center.x + r * Math.cos((deg * Math.PI) / 180),
        y: item.center.y + r * Math.sin((deg * Math.PI) / 180),
      });
      const rr = num(r * scale);
      // Counter-clockwise in the model is clockwise on paper (y flipped): sweep flag 0. A full turn is two halves.
      const steps = sweep >= 360 ? [item.startAngle + 180, item.startAngle + 360] : [item.startAngle + sweep];
      let d = `M ${xy(pointAt(item.startAngle))}`;
      let from = item.startAngle;
      for (const to of steps) {
        d += ` A ${rr} ${rr} 0 ${to - from > 180 ? 1 : 0} 0 ${xy(pointAt(to))}`;
        from = to;
      }
      out.push(`<path d="${d}" ${stroke(item.role, item.layer)}${tags(item, item.role)}/>`);
    } else if (item.kind === 'fill') {
      if (!FILLED.has(item.layer) || item.points.length < 3) continue;
      out.push(
        `<polygon points="${item.points.map((p) => `${X(p)},${Y(p)}`).join(' ')}" fill="${POCHE}" stroke="none"${tags(item, null)}/>`,
      );
    } else if (item.kind === 'hatch') {
      if (item.segments.length === 0) continue;
      const d = item.segments.map((s) => `M ${xy(s.from)} L ${xy(s.to)}`).join(' ');
      out.push(`<path d="${d}" ${stroke(item.role, item.layer)}${tags(item, item.role)}/>`);
    } else {
      // Text keeps its printed size at any scale; a model angle counter-clockwise is a negative SVG rotation.
      const size = num(Math.max(item.sizePt, SHEET_TEXT_MIN_PT) / 72);
      const spacing =
        item.font === 'instrument-sans-600' ? ` letter-spacing="${num(item.letterSpacingPt / 72)}"` : '';
      const rotate =
        item.rotationDeg === 0 ? '' : ` transform="rotate(${num(-item.rotationDeg)} ${X(item.at)} ${Y(item.at)})"`;
      const baseline = item.layer === 'dimensions' ? 'text-after-edge' : 'central';
      out.push(
        `<text x="${X(item.at)}" y="${Y(item.at)}" font-family="${escapeXml(FONT_FAMILY[item.font] ?? 'sans-serif')}" font-size="${size}"${spacing} text-anchor="middle" dominant-baseline="${baseline}" fill="${INK}"${rotate}${tags(item, null)}>${escapeXml(item.text)}</text>`,
      );
    }
  }
  return { markup: out.join(''), shown };
}

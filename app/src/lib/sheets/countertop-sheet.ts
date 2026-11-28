// EZD-720 (R24 #5 "countertop sheets on the client set only"; S13 Decisions 2, 10; S04b Controls "Top schedule ...
// Internal and client only; not on permit sheets"; 08 Exports "Countertop schedule | On sheets, CSV | Piece, material,
// thickness, area, edge profile, edge length"; vault/build/assumptions/EZD-720.md Settled): what the client set's two
// countertop sheets draw.
//   A8.0 Countertop plan: the pieces as cut (outline heavy, seams dashed, cutouts light), each piece's label at its
//   middle, an overhang note on each edge standing past its cabinets ("1 1/2\" OH") and an edge tag on each exposed edge naming its detail on A9.0 ("1/A9.0"), above the TOP SCHEDULE table
//   (EZD-418's rows; no prices).
//   A9.0 Edge details: one section of each edge profile the tops use, numbered as the tags; a profile still offered to
//   the client (an open offer, EZD-417) is drawn marked CLIENT CHOOSING.
// Drawing lists only, so the sheet preview (sheetSvg in the sheet worker) and the PDF (write-pdf) draw the same thing
// (R7). Printed text is English, as every sheet (S13 Decision 7). Pure, no DOM. The piece cell joins label and name
// with " - ", not the editor's " · ": the PDF's embedded DM Mono subset has no middle dot and the writer fails on it
// (vault/build/assumptions/EZD-720.md).
import {
  CM_PER_IN,
  DRAWING_FONTS,
  SHEET_DIMENSION_PT,
  SHEET_NOTE_PT,
  countertopScheduleRows,
  countertopSeamLines,
  isExposedEdgeKind,
  measureTextPt,
  splitPrintMarkBand,
  drawingListBounds,
  formatLength,
  DETAIL_DISPLAY_DENOMINATOR,
  type CountertopPieceData,
  type DrawingItem,
  type DrawingList,
  type Point,
  type SheetArea,
  type SheetSize,
} from '@ezdraft/geometry';
import { COUNTERTOP_PLAN_SHEET, EDGE_DETAILS_SHEET, sheetDrawingArea } from './sheet-set';

export type CountertopSheetPiece = { id: string; data: CountertopPieceData };

// The names the sheets print: catalog materials, the company's edge profiles (key for the section drawn), and the
// profiles still offered on a top whose client has not chosen (open offers).
export type CountertopSheetNames = {
  materials: readonly { id: string; name: string }[];
  profiles: readonly { id: string; key: string; name: string }[];
  open: readonly { pieceId: string; profileIds: readonly string[] }[];
};
export const NO_COUNTERTOP_NAMES: CountertopSheetNames = { materials: [], profiles: [], open: [] };

// One drawing placed on the sheet: model inches at `scale` (paper inches per model inch; null fits it, NTS) with its
// print marks, or paper inches at scale 1 without.
export type CountertopSheetDrawing = { list: DrawingList; scale: number | null; area: SheetArea; marks: boolean };

export const TOP_SCHEDULE_TITLE = 'TOP SCHEDULE';
export const TOP_SCHEDULE_HEADERS = [
  'PIECE',
  'MATERIAL',
  'THICKNESS',
  'AREA (SQ FT)',
  'EDGE PROFILE',
  'EDGE (LF)',
] as const;
export const CLIENT_CHOOSING = 'CLIENT CHOOSING';
const NONE = '—';
const MATERIAL_UNKNOWN = 'Catalog material';

// Paper inches: row height, columns, cell padding, gap between the plan and the table.
const ROW_IN = 0.2;
const COLUMNS_IN = [1.9, 2.0, 0.8, 1.0, 1.9, 0.8] as const;
const PAD_IN = 0.06;
const GAP_IN = 0.25;
const HEAD_ROWS = 2;
// The plan's scales, largest first (1/2", 3/8", 1/4" = 1'-0"), as paper inches per model inch; past the smallest it
// is fitted (NTS).
const PLAN_SCALES = [0.5 / 12, 0.375 / 12, 0.25 / 12] as const;
// Edge sections at 3" = 1'-0", in cells this wide and tall (paper inches), the name under the drawing.
const DETAIL_SCALE = 3 / 12;
const DETAIL_CELL_IN = { width: 2.4, height: 2.2 };
// Model inches: how far an edge tag stands off its edge; how much of the top a section shows.
const TAG_OFFSET_IN = 4;
// An overhang note stands further out than the tag, so the two never overlap.
const OVERHANG_OFFSET_IN = 10;
// The overhang note: the edge's overhang past the cabinet face, as the editor writes lengths ("1 1/2\" OH").
export const overhangNote = (inches: number) => `${formatLength(inches, DETAIL_DISPLAY_DENOMINATOR)} OH`;
const SECTION_DEPTH_IN = 4;

const MONO = DRAWING_FONTS['dm-mono-400'];
const SQ_IN_PER_SQ_FT = 144;
const IN_PER_FT = 12;
// Half up at one decimal place, as the editor's top schedule (editor/countertops/top-schedule.ts).
const oneDecimal = (n: number) => (Math.floor(n * 10 + 0.5 + 1e-9) / 10).toFixed(1);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function textItem(objectId: string, text: string, at: Point, pt: number): DrawingItem {
  return {
    layer: 'rooms',
    objectId,
    kind: 'text',
    text,
    font: 'dm-mono-400',
    sizePt: pt,
    widthPt: measureTextPt(MONO, text, pt),
    at,
    rotationDeg: 0,
    align: 'center',
  };
}

const byLabel = (a: CountertopSheetPiece, b: CountertopSheetPiece) =>
  a.data.attributes.label.length - b.data.attributes.label.length ||
  (a.data.attributes.label < b.data.attributes.label ? -1 : a.data.attributes.label > b.data.attributes.label ? 1 : 0);

export type EdgeDetail = { number: number; profileId: string; key: string | null; name: string; choosing: boolean };

// The A9.0 details in order: each profile the tops carry or are offered, first seen in label order, numbered from 1.
// A profile only ever seen in open offers is marked choosing.
export function edgeDetails(pieces: readonly CountertopSheetPiece[], names: CountertopSheetNames): EdgeDetail[] {
  const out: EdgeDetail[] = [];
  const add = (profileId: string, choosing: boolean) => {
    const had = out.find((d) => same(d.profileId, profileId));
    if (had !== undefined) {
      if (!choosing) had.choosing = false;
      return;
    }
    const p = names.profiles.find((x) => same(x.id, profileId));
    out.push({ number: out.length + 1, profileId, key: p?.key ?? null, name: p?.name ?? NONE, choosing });
  };
  for (const piece of [...pieces].sort(byLabel)) {
    const offer = names.open.find((o) => same(o.pieceId, piece.id));
    if (offer !== undefined) for (const id of offer.profileIds) add(id, true);
    else
      for (const e of piece.data.attributes.edges)
        if (isExposedEdgeKind(e.kind) && e.profileId !== null) add(e.profileId, false);
  }
  return out;
}

// The schedule's cells, one row per piece in label order: piece, material, thickness, area, edge profile, edge length.
export function topScheduleCells(
  pieces: readonly CountertopSheetPiece[],
  names: CountertopSheetNames,
): (readonly [string, string, string, string, string, string])[] {
  const choosing = new Set(
    names.open.filter((o) => pieces.some((p) => same(p.id, o.pieceId))).map((o) => o.pieceId.toLowerCase()),
  );
  const labelChoosing = new Set(
    pieces.filter((p) => choosing.has(p.id.toLowerCase())).map((p) => p.data.attributes.label),
  );
  return countertopScheduleRows(pieces.map((p) => p.data)).map((r) => {
    const material =
      r.materialItemId === null
        ? NONE
        : (names.materials.find((m) => same(m.id, r.materialItemId!))?.name ?? MATERIAL_UNKNOWN);
    const profiles = r.profileIds.flatMap((id) => {
      const n = names.profiles.find((p) => same(p.id, id))?.name;
      return n === undefined ? [] : [n];
    });
    const profile = labelChoosing.has(r.label)
      ? CLIENT_CHOOSING
      : profiles.length > 0
        ? profiles.join(', ')
        : NONE;
    return [
      r.name.length > 0 ? `${r.label} - ${r.name}` : r.label,
      material,
      `${Math.round(r.thickness * CM_PER_IN * 10) / 10} cm`,
      oneDecimal(r.areaSqIn / SQ_IN_PER_SQ_FT),
      profile,
      oneDecimal(r.edgeIn / IN_PER_FT),
    ] as const;
  });
}

const widthIn = (text: string, pt: number) => measureTextPt(MONO, text, pt) / 72;
function fit(text: string, maxIn: number, pt: number): string {
  if (widthIn(text, pt) <= maxIn) return text;
  const chars = [...text];
  while (chars.length > 0 && widthIn(`${chars.join('')}...`, pt) > maxIn) chars.pop();
  return chars.length === 0 ? '' : `${chars.join('')}...`;
}

export const TOP_SCHEDULE_OBJECT_ID = 'top-schedule';

// The table as a drawing list in paper inches (x right, y up, top-left corner at 0,0), `width` wide.
export function topScheduleList(
  cells: readonly (readonly string[])[],
  width: number,
): DrawingList {
  const full = COLUMNS_IN.reduce((a, b) => a + b, 0);
  const cols = COLUMNS_IN.map((c) => (c * width) / full);
  const H = (cells.length + HEAD_ROWS) * ROW_IN;
  const items: DrawingItem[] = [];
  const id = TOP_SCHEDULE_OBJECT_ID;
  const line = (x0: number, y0: number, x1: number, y1: number) =>
    items.push({ layer: 'rooms', objectId: id, kind: 'line', role: 'dimension', from: { x: x0, y: y0 }, to: { x: x1, y: y1 } });
  const text = (value: string, x: number, row: number, maxIn: number, pt: number) => {
    const shown = fit(value, maxIn - 2 * PAD_IN, pt);
    if (shown === '') return;
    items.push(textItem(id, shown, { x: x + PAD_IN + widthIn(shown, pt) / 2, y: -(row + 0.5) * ROW_IN }, pt));
  };
  line(0, 0, width, 0);
  line(width, 0, width, -H);
  line(width, -H, 0, -H);
  line(0, -H, 0, 0);
  for (let r = 1; r < cells.length + HEAD_ROWS; r++) line(0, -r * ROW_IN, width, -r * ROW_IN);
  const xs = [0];
  for (const c of cols) xs.push(xs[xs.length - 1]! + c);
  for (let c = 1; c < cols.length; c++) line(xs[c]!, -ROW_IN, xs[c]!, -H);
  text(TOP_SCHEDULE_TITLE, 0, 0, width, SHEET_DIMENSION_PT);
  TOP_SCHEDULE_HEADERS.forEach((h, c) => text(h, xs[c]!, 1, cols[c]!, SHEET_NOTE_PT));
  cells.forEach((row, i) => row.forEach((v, c) => text(v, xs[c]!, i + HEAD_ROWS, cols[c]!, SHEET_NOTE_PT)));
  return { level: '', items, omitted: [] };
}

const signedArea = (pts: readonly Point[]) =>
  pts.reduce((s, p, i) => {
    const q = pts[(i + 1) % pts.length]!;
    return s + p.x * q.y - q.x * p.y;
  }, 0) / 2;

// The pieces as a drawing list in model inches: outlines, seams, cutouts, labels and edge tags.
export function countertopPlanList(
  pieces: readonly CountertopSheetPiece[],
  details: readonly EdgeDetail[],
  names: CountertopSheetNames,
): DrawingList {
  const items: DrawingItem[] = [];
  const line = (objectId: string, role: 'cut' | 'beyond' | 'hidden', from: Point, to: Point) =>
    items.push({ layer: 'new', objectId, kind: 'line', role, from, to });
  const tagOf = (ids: readonly string[]) => {
    const nums = details.filter((d) => ids.some((id) => same(id, d.profileId))).map((d) => d.number);
    return nums.length === 0 ? null : `${nums.join(',')}/${EDGE_DETAILS_SHEET}`;
  };
  for (const { id, data } of pieces) {
    const outline = data.geometry.outline;
    const ccw = signedArea(outline) > 0;
    const offer = names.open.find((o) => same(o.pieceId, id));
    data.attributes.edges.forEach((e, i) => {
      const a = outline[i]!;
      const b = outline[(i + 1) % outline.length]!;
      if (e.seamId === undefined) line(id, 'cut', a, b);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len === 0) return;
      // The outward normal: right of the edge on a counter-clockwise outline.
      const nx = ((ccw ? 1 : -1) * (b.y - a.y)) / len;
      const ny = ((ccw ? -1 : 1) * (b.x - a.x)) / len;
      const out = (d: number) => ({ x: (a.x + b.x) / 2 + nx * d, y: (a.y + b.y) / 2 + ny * d });
      if (e.overhang > 0) items.push(textItem(id, overhangNote(e.overhang), out(OVERHANG_OFFSET_IN), SHEET_NOTE_PT));
      if (!isExposedEdgeKind(e.kind)) return;
      const tag = tagOf(offer !== undefined ? offer.profileIds : e.profileId === null ? [] : [e.profileId]);
      if (tag === null) return;
      items.push(textItem(id, tag, out(TAG_OFFSET_IN), SHEET_NOTE_PT));
    });
    for (const c of data.attributes.cutouts ?? []) {
      const ux = c.axis.x;
      const uy = c.axis.y;
      const hw = c.width / 2;
      const hd = c.depth / 2;
      const corner = (s: number, t: number) => ({
        x: c.center.x + ux * hw * s - uy * hd * t,
        y: c.center.y + uy * hw * s + ux * hd * t,
      });
      const pts = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
      pts.forEach((p, i) => line(id, 'beyond', p, pts[(i + 1) % 4]!));
    }
    const mid = outline.reduce((s, p) => ({ x: s.x + p.x / outline.length, y: s.y + p.y / outline.length }), {
      x: 0,
      y: 0,
    });
    items.push(textItem(id, data.attributes.label, mid, SHEET_DIMENSION_PT));
  }
  for (const s of countertopSeamLines(pieces.map((p) => p.data))) line(s.seamId, 'hidden', s.a, s.b);
  return { level: '', items, omitted: [] };
}

// The largest plan scale at which the drawing fits the area (above its print marks), or null (NTS).
export function countertopPlanScale(list: DrawingList, area: SheetArea): number | null {
  const b = drawingListBounds(list);
  if (b === null) return PLAN_SCALES[0];
  const { drawing } = splitPrintMarkBand(area);
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  return PLAN_SCALES.find((s) => w * s <= drawing.width && h * s <= drawing.height) ?? null;
}

// One edge profile's section, model inches: the top's edge on the right, `t` thick, SECTION_DEPTH_IN of top shown.
export function edgeSectionItems(objectId: string, key: string | null, t: number): DrawingItem[] {
  const items: DrawingItem[] = [];
  const L = SECTION_DEPTH_IN;
  const P = (x: number, y: number) => ({ x, y });
  const poly = (pts: Point[], role: 'cut' | 'beyond' = 'cut') => {
    for (let i = 0; i + 1 < pts.length; i++)
      items.push({ layer: 'new', objectId, kind: 'line', role, from: pts[i]!, to: pts[i + 1]! });
  };
  const arc = (center: Point, radius: number, startAngle: number, endAngle: number) =>
    items.push({ layer: 'new', objectId, kind: 'arc', role: 'cut', center, radius, startAngle, endAngle });
  const ease = Math.min(0.125, t / 4);
  switch (key) {
    case 'eased':
      poly([P(0, 0), P(L - ease, 0), P(L, ease), P(L, t - ease), P(L - ease, t), P(0, t), P(0, 0)]);
      break;
    case 'bevel': {
      const b = Math.min(0.375, t / 2);
      poly([P(0, 0), P(L, 0), P(L, t - b), P(L - b, t), P(0, t), P(0, 0)]);
      break;
    }
    case 'half_bullnose':
      poly([P(L - t, t), P(0, t), P(0, 0), P(L, 0)]);
      arc(P(L - t, 0), t, 0, 90);
      break;
    case 'full_bullnose':
      poly([P(L - t / 2, t), P(0, t), P(0, 0), P(L - t / 2, 0)]);
      arc(P(L - t / 2, t / 2), t / 2, -90, 90);
      break;
    case 'ogee':
      poly([P(L - t, t), P(0, t), P(0, 0), P(L, 0)]);
      arc(P(L - t, t / 2), t / 2, 0, 90);
      arc(P(L, t / 2), t / 2, 180, 270);
      break;
    case 'mitered_apron': {
      const apron = 4 * t;
      poly([P(0, t), P(L, t), P(L, t - apron), P(L - t, t - apron), P(L - t, 0), P(0, 0), P(0, t)]);
      poly([P(L, t), P(L - t, 0)], 'beyond');
      break;
    }
    default:
      poly([P(0, 0), P(L, 0), P(L, t), P(0, t), P(0, 0)]);
  }
  return items;
}

// What a countertop sheet draws, or [] for any other sheet (or no pieces).
export function countertopSheetFor(
  sheet: string,
  size: SheetSize,
  pieces: readonly CountertopSheetPiece[],
  names: CountertopSheetNames,
): CountertopSheetDrawing[] {
  if (pieces.length === 0) return [];
  const area = sheetDrawingArea(size);
  const details = edgeDetails(pieces, names);
  if (sheet === COUNTERTOP_PLAN_SHEET) {
    const cells = topScheduleCells(pieces, names);
    const width = Math.min(COLUMNS_IN.reduce((a, b) => a + b, 0), area.width);
    const h = (cells.length + HEAD_ROWS) * ROW_IN;
    const plan = { ...area, height: Math.max(0, area.height - h - GAP_IN) };
    const list = countertopPlanList(pieces, details, names);
    return [
      { list, scale: countertopPlanScale(list, plan), area: plan, marks: true },
      {
        list: topScheduleList(cells, width),
        scale: 1,
        area: { x: area.x, y: area.y + area.height - h, width, height: h },
        marks: false,
      },
    ];
  }
  if (sheet !== EDGE_DETAILS_SHEET) return [];
  const thickness = [...pieces].sort(byLabel)[0]!.data.attributes.thickness;
  const perRow = Math.max(1, Math.floor(area.width / DETAIL_CELL_IN.width));
  const out: CountertopSheetDrawing[] = [];
  details.forEach((d, i) => {
    const x = area.x + (i % perRow) * DETAIL_CELL_IN.width;
    const y = area.y + Math.floor(i / perRow) * DETAIL_CELL_IN.height;
    if (y + DETAIL_CELL_IN.height > area.y + area.height) return;
    const id = `edge-detail-${d.number}`;
    const section = edgeSectionItems(id, d.key, thickness);
    out.push({
      list: { level: '', items: section, omitted: [] },
      scale: DETAIL_SCALE,
      area: { x, y, width: DETAIL_CELL_IN.width, height: DETAIL_CELL_IN.height * 0.6 },
      marks: false,
    });
    const lines = [`${d.number}  ${d.name.toUpperCase()}`, ...(d.choosing ? [CLIENT_CHOOSING] : [])];
    const labelItems = lines.map((l, k) =>
      textItem(id, fit(l, DETAIL_CELL_IN.width - 2 * PAD_IN, SHEET_NOTE_PT), { x: DETAIL_CELL_IN.width / 2, y: -(k + 0.5) * ROW_IN }, SHEET_NOTE_PT),
    );
    out.push({
      list: { level: '', items: labelItems, omitted: [] },
      scale: 1,
      area: { x, y: y + DETAIL_CELL_IN.height * 0.6, width: DETAIL_CELL_IN.width, height: lines.length * ROW_IN },
      marks: false,
    });
  });
  return out;
}

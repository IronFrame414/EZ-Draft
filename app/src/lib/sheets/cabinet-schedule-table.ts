// EZD-707 (phase-07 EZD-707 "the cabinet schedule PDF page"; 08 Exports "Cabinet schedule / order | CSV and on sheets
// | Code, qty, finish, notes"; S04 Controls "Cabinet schedule ... Used by sheets"; vault/build/assumptions/EZD-707.md
// Settled "Where the cabinet schedule prints": a table on A4.0 below the elevations, continued on A4.1 when it does
// not fit): the cabinet schedule on the elevations sheet. The rows are EZD-409's schedule
// (lib/cabinets/cabinet-schedule.ts). The table is a drawing list in paper inches (x right, y up, its top-left
// corner at 0,0), so the sheet preview (sheetSvg) and the PDF (write-pdf drawList) draw the same table at scale 1
// (R7). Shared by the sheet renderer, the Sheets screen, the server's sheet list and the PDF export job. No DOM.
import {
  DRAWING_FONTS,
  SHEET_DIMENSION_PT,
  SHEET_NOTE_PT,
  measureTextPt,
  parseStoredObject,
  type DrawingItem,
  type DrawingList,
  type ModelObject,
  type SheetArea,
  type SheetSize,
  type StoredObject,
} from '@ezdraft/geometry';
import {
  cabinetSchedule,
  scheduleFinishText,
  scheduleNotesText,
  type CabinetScheduleRow,
} from '../cabinets/cabinet-schedule';
import { sheetDrawingArea, type Sheet } from './sheet-set';

// The sheet the schedule starts on, and the sheets that continue it (A4.1, A4.2 ...).
export const SCHEDULE_SHEET = 'A4.0';
const CONTINUATION = /^A4\.([1-9]\d*)$/;
// English only, like everything printed on a permit sheet (S13 Decision 7).
export const SCHEDULE_TITLE = 'CABINET SCHEDULE';
export const SCHEDULE_TITLE_CONTINUED = 'CABINET SCHEDULE (CONTINUED)';
export const SCHEDULE_HEADERS = ['CODE', 'QTY', 'FINISH', 'NOTES'] as const;
export const SCHEDULE_SHEET_TITLE = 'Cabinet schedule';
const existingText = (count: number) => `${count} existing`;

// Paper inches: each row, the columns (code, qty, finish, notes), the cell padding, and the gap above the table.
export const SCHEDULE_ROW_IN = 0.2;
export const SCHEDULE_COLUMNS_IN: readonly [number, number, number, number] = [1.25, 0.6, 2.75, 3.4];
export const SCHEDULE_PAD_IN = 0.06;
export const SCHEDULE_GAP_IN = 0.25;
// On A4.0 the table takes at most this share of the drawing area's height; the rest of the rows continue on A4.1.
export const SCHEDULE_MAX_SHARE = 1 / 3;
// The title row and the heading row above the code rows.
const HEAD_ROWS = 2;

const CABINET_TYPES: ReadonlySet<string> = new Set([
  'cabinet_run',
  'cabinet_box',
  'cabinet_filler',
  'cabinet_panel',
  'cabinet_corner',
  'cabinet_shelf',
]);
export const SCHEDULE_OBJECT_TYPES: readonly string[] = [...CABINET_TYPES];

// The schedule rows of a model's stored objects; only the cabinet objects are parsed.
export function scheduleRowsOf(objects: Iterable<StoredObject>): CabinetScheduleRow[] {
  const parsed: ModelObject[] = [];
  for (const o of objects) {
    if (!CABINET_TYPES.has(o.type)) continue;
    const r = parseStoredObject(o);
    if (r.ok) parsed.push(r.object);
  }
  return cabinetSchedule(parsed);
}

// The schedule page a sheet number is: 0 for A4.0, n for A4.n; null for any other sheet.
export function schedulePage(number: string): number | null {
  if (number === SCHEDULE_SHEET) return 0;
  const m = CONTINUATION.exec(number);
  return m === null ? null : Number(m[1]);
}

export type ScheduleSlice = { from: number; to: number; area: SheetArea };
export type SchedulePlan = {
  // Where A4.0's viewports go: the whole drawing area with no rows, else the part above the table.
  elevations: SheetArea;
  // pages[0] is the table on A4.0, pages[n] the one on A4.n; empty with no rows. Each area is the table's exact
  // rectangle (paper inches, y down).
  pages: ScheduleSlice[];
};

export function scheduleTableWidth(area: SheetArea): number {
  return Math.min(
    SCHEDULE_COLUMNS_IN.reduce((a, b) => a + b, 0),
    area.width,
  );
}

// How `count` schedule rows are laid on A4.0 and its continuation sheets of a set size.
export function schedulePlan(size: SheetSize, count: number): SchedulePlan {
  const area = sheetDrawingArea(size);
  if (count <= 0) return { elevations: area, pages: [] };
  const width = scheduleTableWidth(area);
  const tableHeight = (rows: number) => (rows + HEAD_ROWS) * SCHEDULE_ROW_IN;
  const first = Math.max(
    1,
    Math.min(count, Math.floor((area.height * SCHEDULE_MAX_SHARE) / SCHEDULE_ROW_IN) - HEAD_ROWS),
  );
  const h0 = tableHeight(first);
  const pages: ScheduleSlice[] = [
    { from: 0, to: first, area: { x: area.x, y: area.y + area.height - h0, width, height: h0 } },
  ];
  const perPage = Math.max(1, Math.floor(area.height / SCHEDULE_ROW_IN) - HEAD_ROWS);
  for (let from = first; from < count; from += perPage) {
    const to = Math.min(count, from + perPage);
    pages.push({ from, to, area: { x: area.x, y: area.y, width, height: tableHeight(to - from) } });
  }
  return {
    elevations: { ...area, height: area.height - h0 - SCHEDULE_GAP_IN },
    pages,
  };
}

// The set's sheets with one continuation sheet (A4.1, A4.2 ...) per further schedule page, right after A4.0.
// Continuation sheets already in `sheets` are dropped first, so the result is the same however often it is applied.
export function withScheduleSheets(sheets: readonly Sheet[], size: SheetSize, rowCount: number): Sheet[] {
  const more = Math.max(0, schedulePlan(size, rowCount).pages.length - 1);
  const out: Sheet[] = [];
  for (const s of sheets) {
    const page = schedulePage(s.number);
    if (page !== null && page > 0) continue;
    out.push(s);
    if (page !== 0) continue;
    for (let n = 1; n <= more; n++)
      out.push({ ...s, number: `A4.${n}`, title: SCHEDULE_SHEET_TITLE, viewports: [] });
  }
  return out;
}

const MONO = DRAWING_FONTS['dm-mono-400'];
const widthIn = (text: string, pt: number) => measureTextPt(MONO, text, pt) / 72;

// The text cut to fit `maxIn` at `pt`, ending in "..." when cut.
export function fitCellText(text: string, maxIn: number, pt: number): string {
  if (widthIn(text, pt) <= maxIn) return text;
  const chars = [...text];
  while (chars.length > 0 && widthIn(`${chars.join('')}...`, pt) > maxIn) chars.pop();
  return `${chars.join('')}...`;
}

export const SCHEDULE_OBJECT_ID = 'cabinet-schedule';

// The table of `rows` as a drawing list in paper inches: the title row, the heading row, one row per code; `width`
// is the table's width (the columns shrink together when it is under their sum).
export function scheduleTableList(
  rows: readonly CabinetScheduleRow[],
  options: { width: number; continued: boolean },
): DrawingList {
  const full = SCHEDULE_COLUMNS_IN.reduce((a, b) => a + b, 0);
  const k = options.width / full;
  const cols = SCHEDULE_COLUMNS_IN.map((c) => c * k);
  const W = options.width;
  const H = (rows.length + HEAD_ROWS) * SCHEDULE_ROW_IN;
  const items: DrawingItem[] = [];
  const base = { layer: 'rooms', objectId: SCHEDULE_OBJECT_ID } as const;
  const line = (x0: number, y0: number, x1: number, y1: number) =>
    items.push({ ...base, kind: 'line', role: 'dimension', from: { x: x0, y: y0 }, to: { x: x1, y: y1 } });
  // Left-aligned text in a cell: the drawing list centres text on its point, so the point is half the width in.
  const text = (value: string, x: number, row: number, maxIn: number, pt: number) => {
    const shown = fitCellText(value, maxIn - 2 * SCHEDULE_PAD_IN, pt);
    if (shown === '') return;
    const w = measureTextPt(MONO, shown, pt);
    items.push({
      ...base,
      kind: 'text',
      text: shown,
      font: 'dm-mono-400',
      sizePt: pt,
      widthPt: w,
      at: { x: x + SCHEDULE_PAD_IN + w / 72 / 2, y: -(row + 0.5) * SCHEDULE_ROW_IN },
      rotationDeg: 0,
      align: 'center',
    });
  };

  // The frame and a line under every row.
  line(0, 0, W, 0);
  line(W, 0, W, -H);
  line(W, -H, 0, -H);
  line(0, -H, 0, 0);
  for (let r = 1; r < rows.length + HEAD_ROWS; r++) line(0, -r * SCHEDULE_ROW_IN, W, -r * SCHEDULE_ROW_IN);
  // The column lines, from under the title row down.
  const xs = [0];
  for (const c of cols) xs.push(xs[xs.length - 1]! + c);
  for (let c = 1; c < cols.length; c++) line(xs[c]!, -SCHEDULE_ROW_IN, xs[c]!, -H);

  text(options.continued ? SCHEDULE_TITLE_CONTINUED : SCHEDULE_TITLE, 0, 0, W, SHEET_DIMENSION_PT);
  SCHEDULE_HEADERS.forEach((h, c) => text(h, xs[c]!, 1, cols[c]!, SHEET_NOTE_PT));
  rows.forEach((row, i) => {
    const cells = [row.code, String(row.qty), scheduleFinishText(row), scheduleNotesText(row, existingText)];
    cells.forEach((value, c) => text(value, xs[c]!, i + HEAD_ROWS, cols[c]!, SHEET_NOTE_PT));
  });
  return { level: '', items, omitted: [] };
}

// One schedule page's table and where it goes, or null when the sheet has none.
export function scheduleTableFor(
  sheet: string,
  size: SheetSize,
  rows: readonly CabinetScheduleRow[],
): { list: DrawingList; area: SheetArea } | null {
  const page = schedulePage(sheet);
  if (page === null) return null;
  const slice = schedulePlan(size, rows.length).pages[page];
  if (slice === undefined) return null;
  return {
    list: scheduleTableList(rows.slice(slice.from, slice.to), { width: slice.area.width, continued: page > 0 }),
    area: slice.area,
  };
}

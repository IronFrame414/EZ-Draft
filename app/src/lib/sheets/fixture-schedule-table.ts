// EZD-708a (phase-07 EZD-708a "A6.0 from the RCP with the full fixture schedule (lumens, color temperature, trim,
// catalog link)"; S05 Data shown "Fixture schedule: tag, description, count; on sheet also lumens, color temperature,
// trim, catalog link"; AC-EZD-708a-1 "The schedule lists each fixture type tag with its lumens and count."): the
// fixture schedule printed on the RCP sheet (A6.0, and A6.1 ... for each further floor, each with its own floor's
// fixtures). The rows are the left panel's (EZD-508, editor/ceiling/fixture-schedule.ts). Like the cabinet schedule
// (cabinet-schedule-table.ts), the table is a drawing list in paper inches (x right, y up, its top-left corner at 0,0),
// so the sheet preview (sheetSvg) and the PDF draw the same table at scale 1 (R7). It sits at the bottom of the drawing
// area and the RCP viewports share the part above it (vault/build/assumptions/EZD-708a.md). No DOM.
import {
  DRAWING_FONTS,
  SHEET_DIMENSION_PT,
  SHEET_NOTE_PT,
  measureTextPt,
  type DrawingItem,
  type DrawingList,
  type SheetArea,
  type SheetSize,
  type StoredObject,
} from '@ezdraft/geometry';
import {
  fixtureScheduleRows,
  type FixtureKind,
  type FixtureScheduleRow,
} from './fixture-schedule-rows';
import type { Objects } from '../../editor/model/patches';
import type { ObjectValue } from '../outbox/model-api';
import { fitCellText } from './cabinet-schedule-table';
import { floorCopyOf, sheetDrawingArea } from './sheet-set';

// The RCP sheet (S05 Purpose "sheet A6.0").
export const RCP_SHEET = 'A6.0';

// Whether a sheet number is the RCP sheet or one of its floor copies (A6.1 ...).
export function isRcpSheet(number: string | undefined): boolean {
  return number !== undefined && floorCopyOf(number)?.base === RCP_SHEET;
}

// English only, like everything printed on a permit sheet (S13 Decision 7). Wording for Josh to confirm.
export const FIXTURE_TABLE_TITLE = 'FIXTURE SCHEDULE';
export const FIXTURE_TABLE_HEADERS = [
  'TYPE',
  'DESCRIPTION',
  'LUMENS',
  'CCT',
  'TRIM',
  'CATALOG',
  'QTY',
] as const;
export const FIXTURE_KIND_TEXT: Readonly<Record<FixtureKind, string>> = {
  recessed_light: 'Recessed light',
  ceiling_fan: 'Ceiling fan',
};
// The type cell of a kind's untagged row, and the catalog cell of a row whose fixture links a catalog item.
export const FIXTURE_NO_TAG = '—';
export const FIXTURE_CATALOG_LINKED = 'Linked';
const notShown = (n: number) => `${FIXTURE_TABLE_TITLE} (${n} MORE NOT SHOWN)`;

// Paper inches: each row, the columns, the cell padding and the gap between the table and the RCP above it.
export const FIXTURE_ROW_IN = 0.2;
export const FIXTURE_COLUMNS_IN: readonly number[] = [0.55, 1.6, 0.7, 0.65, 1.2, 0.75, 0.5];
export const FIXTURE_PAD_IN = 0.06;
export const FIXTURE_GAP_IN = 0.25;
// The table takes at most this share of the drawing area's height (as the cabinet schedule on A4.0).
export const FIXTURE_MAX_SHARE = 1 / 3;
const HEAD_ROWS = 2;

export const FIXTURE_TABLE_OBJECT_ID = 'fixture-schedule';

// The objects map the editor's schedule reads, from stored objects.
export function objectsOf(stored: Iterable<StoredObject>): Objects {
  const out = new Map<string, ObjectValue>();
  for (const o of stored)
    out.set(o.id, {
      type: o.type,
      schemaVersion: o.schema_version,
      data: o.data as Record<string, unknown>,
    });
  return out;
}

// The printed cells of one row, in FIXTURE_TABLE_HEADERS order.
export function fixtureRowCells(row: FixtureScheduleRow): string[] {
  return [
    row.tag ?? FIXTURE_NO_TAG,
    FIXTURE_KIND_TEXT[row.kind],
    row.lumens === null ? '' : String(row.lumens),
    row.colorTemp === null ? '' : `${row.colorTemp}K`,
    row.trim ?? '',
    row.catalogItemId === null ? '' : FIXTURE_CATALOG_LINKED,
    String(row.count),
  ];
}

export type FixtureTablePlan = {
  // Where the sheet's RCP viewports go: the whole drawing area with no rows, else the part above the table.
  drawing: SheetArea;
  // The table's exact rectangle (paper inches, y down) and how many rows fit; null with no rows.
  table: { area: SheetArea; shown: number } | null;
};

export function fixtureTablePlan(size: SheetSize, count: number): FixtureTablePlan {
  const area = sheetDrawingArea(size);
  if (count <= 0) return { drawing: area, table: null };
  const width = Math.min(
    FIXTURE_COLUMNS_IN.reduce((a, b) => a + b, 0),
    area.width,
  );
  const fit = Math.max(
    1,
    Math.floor((area.height * FIXTURE_MAX_SHARE) / FIXTURE_ROW_IN) - HEAD_ROWS,
  );
  const shown = Math.min(count, fit);
  const h = (shown + HEAD_ROWS) * FIXTURE_ROW_IN;
  return {
    drawing: { ...area, height: area.height - h - FIXTURE_GAP_IN },
    table: { area: { x: area.x, y: area.y + area.height - h, width, height: h }, shown },
  };
}

const MONO = DRAWING_FONTS['dm-mono-400'];

// The table of `rows` as a drawing list in paper inches; `hidden` rows that did not fit are named in the title.
export function fixtureTableList(
  rows: readonly FixtureScheduleRow[],
  options: { width: number; hidden: number },
): DrawingList {
  const full = FIXTURE_COLUMNS_IN.reduce((a, b) => a + b, 0);
  const cols = FIXTURE_COLUMNS_IN.map((c) => (c * options.width) / full);
  const W = options.width;
  const H = (rows.length + HEAD_ROWS) * FIXTURE_ROW_IN;
  const items: DrawingItem[] = [];
  const base = { layer: 'rooms', objectId: FIXTURE_TABLE_OBJECT_ID } as const;
  const line = (x0: number, y0: number, x1: number, y1: number) =>
    items.push({
      ...base,
      kind: 'line',
      role: 'dimension',
      from: { x: x0, y: y0 },
      to: { x: x1, y: y1 },
    });
  // Left-aligned text in a cell: the drawing list centres text on its point, so the point is half the width in.
  const text = (value: string, x: number, row: number, maxIn: number, pt: number) => {
    const shown = fitCellText(value, maxIn - 2 * FIXTURE_PAD_IN, pt);
    if (shown === '') return;
    const w = measureTextPt(MONO, shown, pt);
    items.push({
      ...base,
      kind: 'text',
      text: shown,
      font: 'dm-mono-400',
      sizePt: pt,
      widthPt: w,
      at: { x: x + FIXTURE_PAD_IN + w / 72 / 2, y: -(row + 0.5) * FIXTURE_ROW_IN },
      rotationDeg: 0,
      align: 'center',
    });
  };

  line(0, 0, W, 0);
  line(W, 0, W, -H);
  line(W, -H, 0, -H);
  line(0, -H, 0, 0);
  for (let r = 1; r < rows.length + HEAD_ROWS; r++)
    line(0, -r * FIXTURE_ROW_IN, W, -r * FIXTURE_ROW_IN);
  const xs = [0];
  for (const c of cols) xs.push(xs[xs.length - 1]! + c);
  for (let c = 1; c < cols.length; c++) line(xs[c]!, -FIXTURE_ROW_IN, xs[c]!, -H);

  text(
    options.hidden > 0 ? notShown(options.hidden) : FIXTURE_TABLE_TITLE,
    0,
    0,
    W,
    SHEET_DIMENSION_PT,
  );
  FIXTURE_TABLE_HEADERS.forEach((h, c) => text(h, xs[c]!, 1, cols[c]!, SHEET_NOTE_PT));
  rows.forEach((row, i) =>
    fixtureRowCells(row).forEach((value, c) =>
      text(value, xs[c]!, i + HEAD_ROWS, cols[c]!, SHEET_NOTE_PT),
    ),
  );
  return { level: '', items, omitted: [] };
}

// The fixture schedule of an RCP sheet's floor and where it goes, or null when the sheet is not an RCP sheet or the
// floor has no fixtures.
export function fixtureTableFor(
  sheet: string,
  size: SheetSize,
  rows: readonly FixtureScheduleRow[],
): { list: DrawingList; area: SheetArea } | null {
  if (!isRcpSheet(sheet)) return null;
  const { table } = fixtureTablePlan(size, rows.length);
  if (table === null) return null;
  return {
    list: fixtureTableList(rows.slice(0, table.shown), {
      width: table.area.width,
      hidden: rows.length - table.shown,
    }),
    area: table.area,
  };
}

// The schedule rows of one floor from stored objects.
export function fixtureRowsOf(
  objects: Iterable<StoredObject>,
  level: string | null,
): FixtureScheduleRow[] {
  return fixtureScheduleRows(objectsOf(objects), level);
}

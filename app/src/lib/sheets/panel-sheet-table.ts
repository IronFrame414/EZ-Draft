// EZD-708c (S06 Controls "Add to E2.0 | Inspector, bottom | Places/updates panel schedule and load calc on sheet
// E2.0. | Edit model. If already placed, label reads "Update E2.0""; S06 Controls "Panel schedule ... space, circuit,
// breaker size, poles, wire size, AFCI/GFCI type, load; flags spaces left" and "Load calc line rows ... Each line of
// the math with its basis (e.g. "2,450 sf x 3", "T220.55 col C")"; Q-0763 "the panel schedule and load calc go on the
// sheet after the last layout sheet. A one-floor project keeps the Round 24 default (E1.0 Electrical, E2.0 Panel +
// load calc)"; AC-EZD-708c-1, -2; vault/build/assumptions/EZD-708c.md): the panel sheet's content.
//
// Add to E2.0 turns a panel's schedule (editor/electrical/panel-schedule.ts) and load calc (packages/geometry
// electrical/load-calc.ts) into printed cells and stores them on the permit set (sheet_set `panelSheets`, one entry
// per panel), so the sheet keeps what was placed until Update is pressed and the preview and the PDF print the same
// text (R7). The tables are drawing lists in paper inches (x right, y up, top-left corner at 0,0), as the fixture
// schedule (fixture-schedule-table.ts), drawn at scale 1 in the drawing area of the panel sheet, each panel's schedule
// with its load calc under it. English only, like everything printed on a permit sheet (S13 Decision 7). No DOM.
import {
  CURRENT_SCHEMA_VERSION,
  DRAWING_FONTS,
  SHEET_DIMENSION_PT,
  SHEET_NOTE_PT,
  measureTextPt,
  parseStoredObject,
  type CircuitProtection,
  type DrawingItem,
  type DrawingList,
  type PanelSheetEntry,
  type SheetArea,
  type SheetSetData,
  type SheetSize,
} from '@ezdraft/geometry';
import type { LoadCalcLine, LoadCalcResult } from '@ezdraft/geometry/electrical';
import type { Change, Objects } from '../../editor/model/patches';
import type { PanelSchedule } from '../../editor/electrical/panel-schedule';
import { fitCellText } from './cabinet-schedule-table';
import { defaultSheetSetData, panelSheetNumber, sheetDrawingArea } from './sheet-set';

export type { PanelSheetEntry };

// The schedule's columns, as the full schedule dialog's (EZD-609).
export const PANEL_SCHEDULE_HEADERS = [
  'SPACE',
  'CIRCUIT',
  'BREAKER',
  'POLES',
  'WIRE',
  'AFCI/GFCI',
  'LOAD',
] as const;
export const LOAD_CALC_HEADERS = ['LINE', 'NEC', 'BASIS', 'VA'] as const;

// Wording: the line labels are the inspector's on board S06Electrical; the rest is for Josh to confirm.
export const LOAD_CALC_LABEL: Readonly<Record<LoadCalcLine['key'], string>> = {
  general_lighting: 'General lighting',
  small_appliance: 'Small appliance',
  laundry: 'Laundry',
  subtotal: 'Subtotal',
  demand: 'Demand',
  fixed_appliances: 'Fixed appl.',
  dryer: 'Dryer',
  range: 'Range',
  heating_cooling: 'HVAC, larger of',
  largest_motor: 'Largest motor 25%',
  ev_charger: 'EV charger',
  other: 'Other loads',
  total: 'Total',
};
export const LOAD_CALC_AMPS = 'Amps at 240 V';
export const LOAD_CALC_SERVICE = 'Service';
export const LOAD_CALC_NOT_COMPLETE = 'Load calc not complete';
export const PANEL_SCHEDULE_TITLE = 'PANEL SCHEDULE';
export const LOAD_CALC_TITLE = 'LOAD CALC - NEC ART. 220 STANDARD METHOD';
// The drawing font's middle dot does not embed in the PDF (fontkit cannot subset it), so printed text joins its parts
// with a dash, not the screen's "·".
const SEP = ' - ';
const PROTECTION_TEXT: Readonly<Record<CircuitProtection, string>> = {
  gfci: 'GFCI',
  afci: 'AFCI',
  dual: 'GFCI + AFCI',
};
const NO_WIRE = '—';

const fmt = (n: number) => n.toLocaleString('en-US');
const str = (v: number | string | undefined) => (typeof v === 'number' ? fmt(v) : (v ?? ''));
const tenths = (n: number) => n.toFixed(1);

/** The panel header as printed, e.g. "Panel A - 200A main" (board S06Electrical "Panel A · 200A main"). */
export function panelTitle(panel: { name: string; mainBreaker: number | null }): string {
  return panel.mainBreaker === null ? panel.name : `${panel.name}${SEP}${panel.mainBreaker}A main`;
}

/** One row per space, in PANEL_SCHEDULE_HEADERS order; the second space of a 2-pole circuit names it only. */
export function scheduleCells(schedule: PanelSchedule): string[][] {
  return schedule.spaces.map((s) => {
    const c = s.circuit;
    if (c === null) return [String(s.space), '', '', '', '', '', ''];
    const circuit = `${c.number} ${c.name}`;
    if (!s.first) return [String(s.space), circuit, '', '', '', '', ''];
    return [
      String(s.space),
      circuit,
      `${c.breaker}A`,
      String(c.poles),
      c.wire === null ? NO_WIRE : `${c.wire} AWG`,
      c.protection === null ? '' : PROTECTION_TEXT[c.protection],
      `${fmt(c.load)} VA`,
    ];
  });
}

// The basis of one line: the numbers it is built from (S06 "Each line of the math with its basis").
function basisOf(l: LoadCalcLine): string {
  const d = l.detail;
  const n = (k: string) => Number(d[k] ?? 0);
  switch (l.key) {
    case 'general_lighting':
      return `${str(d.sqft)} sf x ${str(d.vaPerSqft)}`;
    case 'small_appliance':
    case 'laundry':
      return `${str(d.circuits)} x ${str(d.vaEach)}`;
    case 'demand':
      return (
        `${fmt(n('first'))} @${n('firstPercent')}% + ${fmt(n('next'))} @${n('nextPercent')}%` +
        (n('rest') > 0 ? ` + ${fmt(n('rest'))} @${n('restPercent')}%` : '')
      );
    case 'fixed_appliances':
      return `${fmt(n('sum'))} x ${n('percent')}%`;
    case 'dryer':
    case 'ev_charger':
      return `${fmt(n('nameplate'))}, ${fmt(n('minimum'))} min`;
    case 'range':
      return d.column === 'C' ? `${n('nameplate') / 1000} kW col C` : 'nameplate';
    case 'heating_cooling':
      return `heat ${fmt(n('heating'))} / cool ${fmt(n('cooling'))}`;
    case 'largest_motor':
      return `${fmt(n('motorVa'))} x ${n('percent')}%`;
    case 'other':
      return `${n('count')} loads`;
    default:
      return '';
  }
}

/** One row per load calc line, then amps and the service, in LOAD_CALC_HEADERS order; one row when not complete. */
export function loadCalcCells(result: LoadCalcResult | null): string[][] {
  if (result === null || !result.ok) return [[LOAD_CALC_NOT_COMPLETE, '', '', '']];
  const rows = result.lines.map((l) => [
    LOAD_CALC_LABEL[l.key],
    l.ref,
    basisOf(l),
    l.key === 'total' ? `${fmt(l.va)} VA` : fmt(l.va),
  ]);
  rows.push([LOAD_CALC_AMPS, '', `${fmt(result.totalVa)} / 240`, `${tenths(result.amps)} A`]);
  const s = result.service;
  if (s !== null)
    rows.push([
      LOAD_CALC_SERVICE,
      '',
      `${s.percent}% of ${s.amps}A service, ${s.pass ? 'OK' : 'over'}`,
      `${tenths(s.spareAmps)} A spare`,
    ]);
  return rows;
}

/** The entry Add to E2.0 stores for one panel. */
export function panelSheetEntry(
  panel: { id: string; name: string; mainBreaker: number | null },
  schedule: PanelSchedule,
  loadCalc: LoadCalcResult | null,
): PanelSheetEntry {
  return {
    panelId: panel.id,
    title: panelTitle(panel),
    schedule: scheduleCells(schedule),
    spacesLeft: schedule.spacesLeft,
    loadCalc: loadCalcCells(loadCalc),
  };
}

// The live permit set (the lowest id, as the server's set query reads it, server/sheets/sheets.ts), or null.
function permitSet(objects: Objects): { id: string; data: SheetSetData } | null {
  let hit: { id: string; data: SheetSetData } | null = null;
  for (const [id, v] of objects) {
    if (v.type !== 'sheet_set') continue;
    const r = parseStoredObject({ id, type: v.type, schema_version: v.schemaVersion, data: v.data });
    if (!r.ok || r.object.type !== 'sheet_set' || r.object.data.kind !== 'permit') continue;
    if (hit === null || id < hit.id) hit = { id, data: r.object.data };
  }
  return hit;
}

/**
 * The entries whose panel is still in the model (`panelIds`: the ids of its panel objects). A panel deleted after it
 * was placed leaves its entry on the set, which no button can clear, so the sheet does not print it.
 */
export function livePanelSheets(
  entries: readonly PanelSheetEntry[],
  panelIds: Iterable<string>,
): PanelSheetEntry[] {
  const live = new Set<string>();
  for (const id of panelIds) live.add(id.toLowerCase());
  return entries.filter((e) => live.has(e.panelId.toLowerCase()));
}

/** What the permit set holds on its panel sheet, in the order placed, for the panels still in the model. */
export function placedPanelSheets(objects: Objects): readonly PanelSheetEntry[] {
  const entries = permitSet(objects)?.data.panelSheets ?? [];
  if (entries.length === 0) return entries;
  const panels: string[] = [];
  for (const [id, v] of objects) if (v.type === 'panel') panels.push(id);
  return livePanelSheets(entries, panels);
}

/** Whether Add to E2.0 already placed this panel (the button then reads Update). */
export function panelPlaced(objects: Objects, panelId: string): boolean {
  const key = panelId.toLowerCase();
  return placedPanelSheets(objects).some((e) => e.panelId.toLowerCase() === key);
}

/**
 * The one-object change Add to E2.0 (or Update) makes: the entry replaces the panel's own in place, else it is added
 * last. A project whose permit set was never stored gets one, with the default set's fields.
 */
export function panelSheetChange(objects: Objects, entry: PanelSheetEntry, newId: () => string): Change {
  const live = permitSet(objects);
  const data: SheetSetData = live?.data ?? defaultSheetSetData('permit');
  const key = entry.panelId.toLowerCase();
  // The entries of panels deleted since they were placed are dropped with this edit.
  const panels: string[] = [];
  for (const [id, v] of objects) if (v.type === 'panel') panels.push(id);
  const old = livePanelSheets(data.panelSheets ?? [], panels);
  const at = old.findIndex((e) => e.panelId.toLowerCase() === key);
  const panelSheets = at < 0 ? [...old, entry] : old.map((e, i) => (i === at ? entry : e));
  return {
    id: live?.id ?? newId(),
    value: { type: 'sheet_set', schemaVersion: CURRENT_SCHEMA_VERSION, data: { ...data, panelSheets } },
  };
}

// Paper inches: each row, the columns, the cell padding, the gap under a schedule and between columns of tables.
export const PANEL_ROW_IN = 0.2;
export const PANEL_SCHEDULE_COLUMNS_IN: readonly number[] = [0.5, 1.9, 0.65, 0.5, 0.7, 0.9, 0.85];
export const LOAD_CALC_COLUMNS_IN: readonly number[] = [1.5, 1.0, 2.5, 1.0];
export const PANEL_PAD_IN = 0.06;
export const PANEL_GAP_IN = 0.3;
const HEAD_ROWS = 2;
export const PANEL_TABLE_OBJECT_ID = 'panel-sheet';

const MONO = DRAWING_FONTS['dm-mono-400'];
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const tableHeight = (rows: number) => (rows + HEAD_ROWS) * PANEL_ROW_IN;

// A table as a drawing list in paper inches: the title row, the heading row, then the rows.
export function panelTableList(
  title: string,
  headers: readonly string[],
  columnsIn: readonly number[],
  rows: readonly (readonly string[])[],
): DrawingList {
  const W = sum(columnsIn);
  const H = tableHeight(rows.length);
  const items: DrawingItem[] = [];
  const base = { layer: 'rooms', objectId: PANEL_TABLE_OBJECT_ID } as const;
  const line = (x0: number, y0: number, x1: number, y1: number) =>
    items.push({ ...base, kind: 'line', role: 'dimension', from: { x: x0, y: y0 }, to: { x: x1, y: y1 } });
  // Left-aligned text in a cell: the drawing list centres text on its point, so the point is half the width in.
  const text = (value: string, x: number, row: number, maxIn: number, pt: number) => {
    const shown = fitCellText(value, maxIn - 2 * PANEL_PAD_IN, pt);
    if (shown === '') return;
    const w = measureTextPt(MONO, shown, pt);
    items.push({
      ...base,
      kind: 'text',
      text: shown,
      font: 'dm-mono-400',
      sizePt: pt,
      widthPt: w,
      at: { x: x + PANEL_PAD_IN + w / 72 / 2, y: -(row + 0.5) * PANEL_ROW_IN },
      rotationDeg: 0,
      align: 'center',
    });
  };
  line(0, 0, W, 0);
  line(W, 0, W, -H);
  line(W, -H, 0, -H);
  line(0, -H, 0, 0);
  for (let r = 1; r < rows.length + HEAD_ROWS; r++) line(0, -r * PANEL_ROW_IN, W, -r * PANEL_ROW_IN);
  const xs = [0];
  for (const c of columnsIn) xs.push(xs[xs.length - 1]! + c);
  for (let c = 1; c < columnsIn.length; c++) line(xs[c]!, -PANEL_ROW_IN, xs[c]!, -H);
  text(title, 0, 0, W, SHEET_DIMENSION_PT);
  headers.forEach((h, c) => text(h, xs[c]!, 1, columnsIn[c]!, SHEET_NOTE_PT));
  rows.forEach((row, i) =>
    row.forEach((value, c) => {
      if (c < columnsIn.length) text(value, xs[c]!, i + HEAD_ROWS, columnsIn[c]!, SHEET_NOTE_PT);
    }),
  );
  return { level: '', items, omitted: [] };
}

export type PanelTable = { list: DrawingList; area: SheetArea; kind: 'schedule' | 'load_calc'; panelId: string };

function scheduleTitle(entry: PanelSheetEntry): string {
  const left =
    entry.spacesLeft === null
      ? ''
      : entry.spacesLeft === 0
        ? `${SEP}NO SPACES LEFT`
        : `${SEP}${entry.spacesLeft} ${entry.spacesLeft === 1 ? 'SPACE' : 'SPACES'} LEFT`;
  return `${entry.title.toUpperCase()}${SEP}${PANEL_SCHEDULE_TITLE}${left}`;
}

/**
 * The tables of the panel sheet (the sheet after the last electrical layout sheet, E2.0 with one floor) and where
 * they go, or null on any other sheet. Each panel's schedule stands at the top of a column of the drawing area with
 * its load calc under it, or at the top of the next column when both do not fit; the columns run left to right.
 */
export function panelSheetTables(
  sheet: string | undefined,
  size: SheetSize,
  floorCount: number,
  entries: readonly PanelSheetEntry[],
): PanelTable[] | null {
  if (sheet === undefined || sheet !== panelSheetNumber(floorCount)) return null;
  const area = sheetDrawingArea(size);
  const out: PanelTable[] = [];
  let x = area.x;
  let y = area.y;
  const place = (
    kind: PanelTable['kind'],
    panelId: string,
    title: string,
    headers: readonly string[],
    cols: readonly number[],
    rows: readonly (readonly string[])[],
  ) => {
    const width = sum(cols);
    const height = tableHeight(rows.length);
    if (y > area.y && y + height > area.y + area.height) {
      x += Math.max(sum(PANEL_SCHEDULE_COLUMNS_IN), sum(LOAD_CALC_COLUMNS_IN)) + PANEL_GAP_IN;
      y = area.y;
    }
    out.push({ kind, panelId, list: panelTableList(title, headers, cols, rows), area: { x, y, width, height } });
    y += height + PANEL_GAP_IN;
  };
  entries.forEach((e, i) => {
    if (i > 0) {
      x += Math.max(sum(PANEL_SCHEDULE_COLUMNS_IN), sum(LOAD_CALC_COLUMNS_IN)) + PANEL_GAP_IN;
      y = area.y;
    }
    place('schedule', e.panelId, scheduleTitle(e), PANEL_SCHEDULE_HEADERS, PANEL_SCHEDULE_COLUMNS_IN, e.schedule);
    place('load_calc', e.panelId, `${e.title.toUpperCase()}${SEP}${LOAD_CALC_TITLE}`, LOAD_CALC_HEADERS, LOAD_CALC_COLUMNS_IN, e.loadCalc);
  });
  return out;
}

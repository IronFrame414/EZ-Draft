// EZD-702b (11 rule 3 "sheet SVG building ... run in Web Workers"; R7 one drawing list feeds the sheet): the sheet
// worker's job. The open sheet's floor, from the stored objects, as SVG in paper inches (`sheetSvg`).
// EZD-703 (phase-07 EZD-703 "Existing, Demo and Proposed views driven by object status"; S13 Rail: Viewport; 09h
// "details true scale or NTS"; AC-EZD-703-1): one job is one viewport. `view` keeps only the objects of the statuses
// it shows (lib/sheets/viewport.ts; the Existing view takes Demo objects and draws them as existing, 09m row 4), before the drawing list is built, so rooms, dimensions and flagged items follow
// their own object's status; no view draws every status. A null scale is not to scale: the drawing is fitted to the
// area.
// EZD-705 (S13 Validation "Every sheet gets a scale bar and a printed check dimension"; 09h "NTS details stamped
// \"NTS\""; AC-EZD-705-1): a viewport that draws anything keeps a strip at the bottom of its area for its print marks
// (packages/geometry drawing/print-marks.ts): a scale bar and a check dimension at its scale, or NTS. The drawing is
// centred in the area above the strip.
// EZD-707 (R24; AC-EZD-707-1, -2, -3): an elevation viewport (`elevation` set) draws its floor's elevations
// (packages/geometry elevations/wall-elevation.ts) and then its added walls, each in its own cell of the area
// (lib/sheets/elevation-sheet.ts) with its own print marks, in the viewport's view.
// EZD-708a (S05 Purpose "produce the reflected ceiling plan (RCP) for the permit set (sheet A6.0)"; Q-0780 "Supply
// diffusers, returns and exhaust fans on the RCP ... print on A6.0 when placed, and nothing requires them";
// AC-EZD-708a-1, -3): a plan viewport on the RCP sheet (`rcp` set) draws the RCP the Ceiling surface shows
// (editor/ceiling/rcp-list.ts). That drawing code is editor code, so it is the lazy module lazy/rcp-sheet, loaded by
// import() the first time an RCP viewport is drawn (EZD-020 import boundaries; 11 rule 7): `runSheetJob` sends an
// `rcp` input there and every other input to `sheetJob`. Its fixture schedule is a table job of its own (`fixtures`,
// lib/sheets/fixture-schedule-table.ts).
// EZD-708b (Q-0763 "E1.0 is the layout with devices and symbols"; AC-EZD-708b-1): a plan viewport on an electrical
// sheet (`electrical` set) draws the electrical plan with the circuit tags and home runs (lazy/electrical-sheet, loaded
// by import() from `runSheetJob` as the RCP is), and the sheet's EC verification note is a job of its own (`ecNote`,
// lib/sheets/electrical-kinds.ts).
import { viewDrawsAs, viewShows } from '../lib/sheets/viewport';
import { fixtureTableFor } from '../lib/sheets/fixture-schedule-table';
import { ecNoteFor } from '../lib/sheets/electrical-kinds';
import type { FixtureScheduleRow } from '../lib/sheets/fixture-schedule-rows';
import { elevationCells } from '../lib/sheets/elevation-sheet';
import { scheduleTableFor } from '../lib/sheets/cabinet-schedule-table';
import type { CabinetScheduleRow } from '../lib/cabinets/cabinet-schedule';
import {
  SHEET_SIZES,
  SHEET_VIEWS,
  buildDrawingList,
  drawingListBounds,
  parseStoredObject,
  printMarks,
  printMarksSvg,
  sheetSvg,
  splitPrintMarkBand,
  type DrawingList,
  type ModelObject,
  type SheetArea,
  type SheetSize,
  type SheetView,
  type SheetSvg,
  type StoredObject,
} from '@ezdraft/geometry';
import { elevationDrawingList, elevationSubjects } from '@ezdraft/geometry/elevations';

export const SHEET_JOB = 'sheet-svg';

// The dimension and room label text size on a sheet: 09h "minimum 3/32\" on 24x36; labels and dims one size up from
// notes", so notes at 3/32" and labels and dims at 1/8" = 9 pt (vault/build/assumptions.md EZD-702b).
export const SHEET_LABEL_PT = 9;

export type SheetJobInput = {
  objects: StoredObject[];
  level: string;
  // Paper inches per model inch; null fits the drawing to the area (NTS).
  scale: number | null;
  area: SheetArea;
  // The statuses shown; absent draws every status.
  view?: SheetView;
  // EZD-707: an elevation viewport, with the walls added to it; absent for a plan.
  elevation?: { walls: string[] };
  // EZD-708a: a plan viewport on the RCP sheet draws the reflected ceiling plan.
  rcp?: boolean;
  // EZD-708b: a plan viewport on an electrical sheet draws the electrical plan.
  electrical?: boolean;
};

// EZD-708b: the EC verification note of an electrical sheet.
export type SheetEcNoteJobInput = {
  ecNote: { sheet: string; size: SheetSize };
};

// EZD-708a: the fixture schedule table of an RCP sheet (A6.0 or a floor copy), from its floor's schedule rows.
export type SheetFixturesJobInput = {
  fixtures: { sheet: string; size: SheetSize; rows: FixtureScheduleRow[] };
};

// EZD-707: the cabinet schedule table of one schedule sheet (A4.0 or a continuation), from the schedule rows.
export type SheetTableJobInput = {
  table: { sheet: string; size: SheetSize; rows: CabinetScheduleRow[] };
};

// An NTS drawing fills this share of its area, so it never touches the area's edge.
export const NTS_FILL = 0.9;

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export function readInput(input: unknown): SheetJobInput {
  if (typeof input !== 'object' || input === null) throw new Error('sheet_input');
  const i = input as Partial<SheetJobInput>;
  const a = i.area as Partial<SheetArea> | undefined;
  if (
    !Array.isArray(i.objects) ||
    typeof i.level !== 'string' ||
    !(i.scale === null || (finite(i.scale) && i.scale > 0)) ||
    (i.view !== undefined && !(SHEET_VIEWS as readonly unknown[]).includes(i.view)) ||
    (i.rcp !== undefined && typeof i.rcp !== 'boolean') ||
    (i.electrical !== undefined && typeof i.electrical !== 'boolean') ||
    (i.elevation !== undefined &&
      (typeof i.elevation !== 'object' ||
        i.elevation === null ||
        !Array.isArray(i.elevation.walls) ||
        !i.elevation.walls.every((w) => typeof w === 'string'))) ||
    a === undefined ||
    !finite(a.x) ||
    !finite(a.y) ||
    !finite(a.width) ||
    !finite(a.height)
  )
    throw new Error('sheet_input');
  return i as SheetJobInput;
}

// EZD-715: the drawing list of one viewport (its floor, its view), shared with the PDF export job so the PDF draws
// exactly what the sheet preview draws (R7).
export function viewportDrawingList(
  objects: readonly StoredObject[],
  level: string,
  view?: SheetView,
): DrawingList {
  return buildDrawingList(
    { objects: viewObjects(objects, view) },
    { level, dimensionTextPt: SHEET_LABEL_PT, roomHatch: null, roomLabelPt: SHEET_LABEL_PT },
  );
}

// The stored objects a view shows, parsed; what is marked Demo is drawn as existing in the Existing view.
export function viewObjects(objects: readonly StoredObject[], view?: SheetView): ModelObject[] {
  const parsed: ModelObject[] = [];
  for (const stored of objects) {
    const r = parseStoredObject(stored);
    if (!r.ok) continue;
    const status = (r.object.data as { status?: unknown }).status;
    if (view !== undefined && !viewShows(view, status)) continue;
    // 09m row 4: the Existing view shows what is marked Demo as it stands today, drawn as existing.
    if (view === 'existing' && status === 'demo')
      parsed.push({ ...r.object, data: { ...r.object.data, status: viewDrawsAs(view, status) } } as ModelObject);
    else parsed.push(r.object);
  }
  return parsed;
}

// EZD-707: an elevation viewport's elevations, one drawing list per cell of its area, in sheet order (shared with
// the PDF export job, R7). The title prints one size up from notes, as labels do (09h).
export function elevationViewportLists(
  objects: readonly StoredObject[],
  level: string,
  view: SheetView | undefined,
  walls: readonly string[],
  area: SheetArea,
): { list: DrawingList; area: SheetArea }[] {
  const shown = viewObjects(objects, view);
  const subjects = elevationSubjects(shown, level, walls);
  const cells = elevationCells(area, subjects.length);
  return subjects.map((subject, i) => ({
    list: elevationDrawingList(subject, shown, { level, titlePt: SHEET_LABEL_PT }),
    area: cells[i]!,
  }));
}

// One drawing in its area, above its print marks.
export function drawInArea(list: DrawingList, scale: number | null, area: SheetArea): SheetSvg {
  const { drawing } = splitPrintMarkBand(area);
  const svg = sheetSvg(list, { scale: scale ?? ntsScale(list, drawing), area: drawing });
  if (svg.markup === '') return svg;
  return { ...svg, markup: svg.markup + printMarksSvg(printMarks(scale, area)) };
}

function fixturesJob(input: SheetFixturesJobInput['fixtures']): SheetSvg {
  if (typeof input.sheet !== 'string' || !Array.isArray(input.rows) || !SHEET_SIZES.includes(input.size))
    throw new Error('sheet_input');
  const t = fixtureTableFor(input.sheet, input.size, input.rows);
  if (t === null) return { markup: '', shown: [] };
  return { markup: sheetSvg(t.list, { scale: 1, area: t.area }).markup, shown: [] };
}

function ecNoteJob(input: SheetEcNoteJobInput['ecNote']): SheetSvg {
  if (typeof input.sheet !== 'string' || !SHEET_SIZES.includes(input.size)) throw new Error('sheet_input');
  const lines = ecNoteFor(input.sheet, input.size) ?? [];
  return { markup: lines.map((l) => sheetSvg(l.list, { scale: 1, area: l.area }).markup).join(''), shown: [] };
}

function tableJob(input: SheetTableJobInput['table']): SheetSvg {
  if (typeof input.sheet !== 'string' || !Array.isArray(input.rows) || !SHEET_SIZES.includes(input.size))
    throw new Error('sheet_input');
  const t = scheduleTableFor(input.sheet, input.size, input.rows);
  if (t === null) return { markup: '', shown: [] };
  // Paper inches at scale 1, in the table's own rectangle; the table names no model object.
  return { markup: sheetSvg(t.list, { scale: 1, area: t.area }).markup, shown: [] };
}

export function sheetJob(input: unknown): SheetSvg {
  if (typeof input === 'object' && input !== null && 'table' in input) {
    const table = (input as Partial<SheetTableJobInput>).table;
    if (typeof table !== 'object' || table === null) throw new Error('sheet_input');
    return tableJob(table);
  }
  if (typeof input === 'object' && input !== null && 'fixtures' in input) {
    const fixtures = (input as Partial<SheetFixturesJobInput>).fixtures;
    if (typeof fixtures !== 'object' || fixtures === null) throw new Error('sheet_input');
    return fixturesJob(fixtures);
  }
  if (typeof input === 'object' && input !== null && 'ecNote' in input) {
    const ecNote = (input as Partial<SheetEcNoteJobInput>).ecNote;
    if (typeof ecNote !== 'object' || ecNote === null) throw new Error('sheet_input');
    return ecNoteJob(ecNote);
  }
  const { objects, level, scale, area, view, elevation, rcp, electrical } = readInput(input);
  // EZD-708a: an RCP viewport is drawn by the lazy RCP module (runSheetJob).
  if (rcp === true) throw new Error('sheet_rcp_lazy');
  // EZD-708b: an electrical viewport is drawn by the lazy electrical module (runSheetJob).
  if (electrical === true) throw new Error('sheet_electrical_lazy');
  if (elevation === undefined) return drawInArea(viewportDrawingList(objects, level, view), scale, area);
  const svgs = elevationViewportLists(objects, level, view, elevation.walls, area).map((c) =>
    drawInArea(c.list, scale, c.area),
  );
  return { markup: svgs.map((s) => s.markup).join(''), shown: [...new Set(svgs.flatMap((s) => s.shown))].sort() };
}

// EZD-708a: the worker's job: an RCP viewport through the lazy RCP module, anything else through sheetJob.
// EZD-708b: an electrical viewport through the lazy electrical module.
export async function runSheetJob(input: unknown): Promise<SheetSvg> {
  if (typeof input === 'object' && input !== null && (input as { rcp?: unknown }).rcp === true) {
    const { rcpSheetJob } = await import('../lazy/rcp-sheet');
    return rcpSheetJob(input);
  }
  if (typeof input === 'object' && input !== null && (input as { electrical?: unknown }).electrical === true) {
    const { electricalSheetJob } = await import('../lazy/electrical-sheet');
    return electricalSheetJob(input);
  }
  return sheetJob(input);
}

// The scale that fits the drawing to the area, at NTS_FILL.
export function ntsScale(list: DrawingList, area: SheetArea): number {
  const b = drawingListBounds(list);
  const w = b === null ? 0 : b.maxX - b.minX;
  const h = b === null ? 0 : b.maxY - b.minY;
  const fit = Math.min(w > 0 ? area.width / w : Infinity, h > 0 ? area.height / h : Infinity);
  return Number.isFinite(fit) ? fit * NTS_FILL : 1;
}

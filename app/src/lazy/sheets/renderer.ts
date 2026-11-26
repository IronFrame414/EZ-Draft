// EZD-702b (phase-07 EZD-702b "builds each sheet as SVG from the EZD-238 drawing list in a worker; only the open sheet
// is drawn live"; 11 rule 3, rule 7): the sheet renderer. One render is one job on the worker pool: the open floor's
// stored objects in, the sheet SVG markup out. Its own lazy chunk, loaded by the Sheets screen the first time a plan
// sheet is drawn, so neither it nor the drawing code is in the Plan bundle.
// EZD-703 (S13 Rail: Viewport; AC-EZD-703-1): a sheet is drawn viewport by viewport. Each plan viewport is one job: its
// floor (the lowest when it names none or a floor since deleted), its view and its scale, in its column of the
// drawing area (lib/sheets/viewport.ts viewportAreas); the markup of the jobs is joined in viewport order.
// EZD-707 (AC-EZD-707-1): an elevation viewport is one job too, on its floor, with the walls added to it; the worker
// lays out its elevations (workers/sheet-job.ts).
import type { SheetSize, SheetSvg, StoredObject } from '@ezdraft/geometry';
import { createWorkerPool, type WorkerPool } from '../../editor/workers/worker-pool';
import { resolveOpenFloor } from '../../editor/floors/floors';
import type { Objects } from '../../editor/model/patches';
import { sheetDrawingArea } from '../../lib/sheets/sheet-set';
import { viewportAreas, viewportScaleFactor, type SheetViewport } from '../../lib/sheets/viewport';
import { schedulePage, schedulePlan, scheduleRowsOf } from '../../lib/sheets/cabinet-schedule-table';
import { SHEET_JOB, type SheetJobInput, type SheetTableJobInput } from '../../workers/sheet-job';

export type SheetRenderRequest = {
  objects: Objects;
  size: SheetSize;
  viewports: readonly Omit<SheetViewport, 'id' | 'sheet'>[];
  // EZD-707: the sheet's number; a schedule sheet (A4.0 and its continuations) also draws the cabinet schedule.
  sheet?: string;
};

export type SheetRenderer = {
  // The sheet SVG of the sheet's plan and elevation viewports, or null when the model has no floor or the sheet
  // neither.
  render(request: SheetRenderRequest): Promise<SheetSvg | null>;
  dispose(): void;
};

export type RunSheetJob = (input: SheetJobInput | SheetTableJobInput) => Promise<SheetSvg>;

// EZD-707: the cabinet schedule job of a schedule sheet, or null when the sheet prints no table.
export function sheetTableJobInput(request: SheetRenderRequest): SheetTableJobInput | null {
  if (request.sheet === undefined) return null;
  const page = schedulePage(request.sheet);
  if (page === null) return null;
  const rows = scheduleRowsOf(storedOf(request.objects));
  if (schedulePlan(request.size, rows.length).pages[page] === undefined) return null;
  return { table: { sheet: request.sheet, size: request.size, rows } };
}

function* storedOf(objects: Objects): Iterable<StoredObject> {
  for (const [id, v] of objects) yield { id, type: v.type, schema_version: v.schemaVersion, data: v.data };
}

// The jobs' inputs, one per plan or elevation viewport: every stored object (the worker keeps those on the floor and in the view)
// and where the viewport goes. Empty when the model has no floor.
export function sheetJobInputs(request: SheetRenderRequest): SheetJobInput[] {
  if (resolveOpenFloor(request.objects, null) === null) return [];
  const objects: StoredObject[] = [];
  for (const [id, v] of request.objects)
    objects.push({ id, type: v.type, schema_version: v.schemaVersion, data: v.data });
  // EZD-707: on A4.0 the viewports stand above the cabinet schedule table.
  const table = sheetTableJobInput(request);
  const area =
    table !== null && request.sheet !== undefined && schedulePage(request.sheet) === 0
      ? schedulePlan(request.size, table.table.rows.length).elevations
      : sheetDrawingArea(request.size);
  const areas = viewportAreas(area, request.viewports.length);
  const out: SheetJobInput[] = [];
  request.viewports.forEach((vp, i) => {
    if (vp.kind !== 'plan' && vp.kind !== 'elevation') return;
    const level = resolveOpenFloor(request.objects, vp.level);
    if (level === null) return;
    const input: SheetJobInput = { objects, level, scale: viewportScaleFactor(vp.scale), area: areas[i]!, view: vp.view };
    if (vp.kind === 'elevation') input.elevation = { walls: [...(vp.walls ?? [])] };
    out.push(input);
  });
  return out;
}

function poolRun(): { run: RunSheetJob; pool: WorkerPool } {
  const pool = createWorkerPool({
    create: () =>
      new Worker(new URL('../../workers/sheet.worker.ts', import.meta.url), { type: 'module' }),
    size: 1,
  });
  return { run: (input) => pool.run<SheetSvg>(SHEET_JOB, input), pool };
}

export function createSheetRenderer(run?: RunSheetJob): SheetRenderer {
  let made: { run: RunSheetJob; pool: WorkerPool | null } | null =
    run === undefined ? null : { run, pool: null };
  return {
    async render(request) {
      const table = sheetTableJobInput(request);
      const inputs: (SheetJobInput | SheetTableJobInput)[] = sheetJobInputs(request);
      if (table !== null) inputs.push(table);
      if (inputs.length === 0) return null;
      made ??= poolRun();
      const run = made.run;
      const svgs = await Promise.all(inputs.map((input) => run(input)));
      return {
        markup: svgs.map((s) => s.markup).join(''),
        shown: [...new Set(svgs.flatMap((s) => s.shown))].sort(),
      };
    },
    dispose() {
      made?.pool?.dispose();
      made = null;
    },
  };
}

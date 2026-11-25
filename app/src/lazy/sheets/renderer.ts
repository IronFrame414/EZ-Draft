// EZD-702b (phase-07 EZD-702b "builds each sheet as SVG from the EZD-238 drawing list in a worker; only the open sheet
// is drawn live"; 11 rule 3, rule 7): the sheet renderer. One render is one job on the worker pool: the open floor's
// stored objects in, the sheet SVG markup out. Its own lazy chunk, loaded by the Sheets screen the first time a plan
// sheet is drawn, so neither it nor the drawing code is in the Plan bundle.
import { QUARTER_INCH_SCALE, type SheetSize, type SheetSvg, type StoredObject } from '@ezdraft/geometry';
import { createWorkerPool, type WorkerPool } from '../../editor/workers/worker-pool';
import { resolveOpenFloor } from '../../editor/floors/floors';
import type { Objects } from '../../editor/model/patches';
import { sheetDrawingArea } from '../../lib/sheets/sheet-set';
import { SHEET_JOB, type SheetJobInput } from '../../workers/sheet-job';

export type SheetRenderRequest = { objects: Objects; size: SheetSize };

export type SheetRenderer = {
  // The sheet SVG of the lowest floor at 1/4" = 1'-0", or null when the model has no floor.
  render(request: SheetRenderRequest): Promise<SheetSvg | null>;
  dispose(): void;
};

export type RunSheetJob = (input: SheetJobInput) => Promise<SheetSvg>;

// The job's input: every stored object (the worker keeps those on the floor) and where the plan goes.
export function sheetJobInput(request: SheetRenderRequest): SheetJobInput | null {
  const level = resolveOpenFloor(request.objects, null);
  if (level === null) return null;
  const objects: StoredObject[] = [];
  for (const [id, v] of request.objects)
    objects.push({ id, type: v.type, schema_version: v.schemaVersion, data: v.data });
  return { objects, level, scale: QUARTER_INCH_SCALE, area: sheetDrawingArea(request.size) };
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
      const input = sheetJobInput(request);
      if (input === null) return null;
      made ??= poolRun();
      return made.run(input);
    },
    dispose() {
      made?.pool?.dispose();
      made = null;
    },
  };
}

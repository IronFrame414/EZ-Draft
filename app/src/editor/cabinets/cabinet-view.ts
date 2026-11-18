// EZD-404 (S04 Layout; S04 Controls "Click box (plan strip or elevation) | Selects that box; same box highlights in
// both views", "Hover box | Highlights the same box in both views", "Esc | Clears selection"; AC-EZD-404-1;
// vault/build/assumptions.md EZD-404): what the cabinet run screen reads from the model, and its selection. Pure: no
// React, no DOM. One selection is read by both the plan strip and the elevation, so a box picked in either is the
// box marked in both.
import {
  cabinetElevationLetter,
  cabinetRunLayout,
  cabinetRunSummary,
  objectLookup,
  parseStoredObject,
  type CabinetRun,
  type CabinetRunLayout,
  type CabinetRunSummary,
  type ModelObject,
} from '@ezdraft/geometry';
import type { Objects } from '../model/patches';

export type CabinetView = {
  run: CabinetRun;
  layout: CabinetRunLayout;
  summary: CabinetRunSummary;
  letter: string;
  // The elevations that include this run (S04 Decisions "elevation picker"): a run stands on one wall, so one.
  elevations: string[];
};

// Every object of the model the screen can read, in model order; objects that do not parse are left out.
export function modelObjects(objects: Objects): ModelObject[] {
  const out: ModelObject[] = [];
  for (const [id, v] of objects) {
    const r = parseStoredObject({ id, type: v.type, schema_version: v.schemaVersion, data: v.data });
    if (r.ok) out.push(r.object);
  }
  return out;
}

// The run the screen opens: the first run on the open floor (the Runs tab, EZD-403, picks another); null when the
// floor has none. `floorId` null reads every floor.
export function cabinetView(objects: readonly ModelObject[], floorId: string | null): CabinetView | null {
  const want = floorId?.toLowerCase() ?? null;
  const run = objects.find(
    (o): o is CabinetRun =>
      o.type === 'cabinet_run' && (want === null || o.data.level.toLowerCase() === want),
  );
  if (run === undefined) return null;
  const letter = cabinetElevationLetter(run, objects);
  return {
    run,
    layout: cabinetRunLayout(run, objects),
    summary: cabinetRunSummary(run, objectLookup(objects)),
    letter,
    elevations: [letter],
  };
}

export type CabinetSelection = { readonly ids: readonly string[]; readonly hoveredId: string | null };

export const NO_CABINET_SELECTION: CabinetSelection = { ids: [], hoveredId: null };

export type CabinetSelectionInput =
  | { type: 'click'; id: string | null }
  | { type: 'hover'; id: string | null }
  | { type: 'escape' };

// A click on a box selects that box alone; a click off every box or Esc clears; hover marks one box.
export function cabinetSelect(s: CabinetSelection, i: CabinetSelectionInput): CabinetSelection {
  switch (i.type) {
    case 'click':
      return { ...s, ids: i.id === null ? [] : [i.id] };
    case 'hover':
      return s.hoveredId === i.id ? s : { ...s, hoveredId: i.id };
    case 'escape':
      return s.ids.length === 0 ? s : { ...s, ids: [] };
  }
}

export const isCabinetSelected = (s: CabinetSelection, id: string): boolean =>
  s.ids.some((x) => x.toLowerCase() === id.toLowerCase());

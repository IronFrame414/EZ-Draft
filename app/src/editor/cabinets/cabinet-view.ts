// EZD-404 (S04 Layout; S04 Controls "Click box (plan strip or elevation) | Selects that box; same box highlights in
// both views", "Hover box | Highlights the same box in both views", "Esc | Clears selection"; AC-EZD-404-1;
// vault/build/assumptions.md EZD-404): what the cabinet run screen reads from the model, and its selection. Pure: no
// React, no DOM. One selection is read by both the plan strip and the elevation, so a box picked in either is the
// box marked in both.
import {
  CABINET_COUNTERTOP_THICKNESS,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_TILE_HEIGHT,
  DEFAULT_TILE_JOINT,
  DEFAULT_TILE_WIDTH,
  DEFAULT_WALL_TILE_HEIGHT,
  wallStartFromElevation,
  type TilePattern,
  cabinetElevationLetter,
  cabinetRowOf,
  insertAfterInCabinetRun,
  isCabinetRunOffWall,
  isCabinetRunMember,
  moveInCabinetRow,
  reheightCabinetMember,
  removeFromCabinetRun,
  resizeCabinetMember,
  cabinetRunLayout,
  cabinetRunSummary,
  cabinetRunFit,
  cabinetAutoFill,
  CABINET_BASE_DEPTH,
  CABINET_BASE_HEIGHT,
  insertAtInCabinetRow,
  objectLookup,
  parseStoredObject,
  type CabinetAutoFill,
  type CabinetRun,
  type CabinetRunFit,
  type CabinetRunLayout,
  type CabinetRunMember,
  type CabinetRunSummary,
  type CabinetRow,
  type ModelObject,
} from '@ezdraft/geometry';
import type { Change, Objects } from '../model/patches';
import { libraryObject, type LibraryRow, type LibraryTrim } from './cabinet-library';

export type CabinetView = {
  run: CabinetRun;
  layout: CabinetRunLayout;
  summary: CabinetRunSummary;
  letter: string;
  // The elevations that include this run (S04 Decisions "elevation picker"): a run stands on one wall, so one.
  elevations: string[];
  // EZD-410 (S04 Validation "Hosted cabinet left off a wall after a wall move: red 'Not on a wall' flag"): the run no
  // longer stands on its host wall, read from the model each time (cabinets/hosting.ts).
  offWall: boolean;
};

// Every object of the model the screen can read, in model order; objects that do not parse are left out.
export function modelObjects(objects: Objects): ModelObject[] {
  const out: ModelObject[] = [];
  for (const [id, v] of objects) {
    const r = parseStoredObject({
      id,
      type: v.type,
      schema_version: v.schemaVersion,
      data: v.data,
    });
    if (r.ok) out.push(r.object);
  }
  return out;
}

// Every run on the open floor, in model order. `floorId` null reads every floor.
export function cabinetRuns(objects: readonly ModelObject[], floorId: string | null): CabinetRun[] {
  const want = floorId?.toLowerCase() ?? null;
  return objects.filter(
    (o): o is CabinetRun =>
      o.type === 'cabinet_run' && (want === null || o.data.level.toLowerCase() === want),
  );
}

// The run the screen opens: `runId` when it is a run on the open floor (the Runs tab, EZD-403, picks it), else the
// first run on the floor; null when the floor has none. `floorId` null reads every floor.
export function cabinetView(
  objects: readonly ModelObject[],
  floorId: string | null,
  runId: string | null = null,
): CabinetView | null {
  const runs = cabinetRuns(objects, floorId);
  const key = runId?.toLowerCase() ?? null;
  const run = (key === null ? undefined : runs.find((r) => r.id.toLowerCase() === key)) ?? runs[0];
  if (run === undefined) return null;
  const letter = cabinetElevationLetter(run, objects);
  return {
    run,
    layout: cabinetRunLayout(run, objects),
    summary: cabinetRunSummary(run, objectLookup(objects)),
    letter,
    elevations: [letter],
    offWall: isCabinetRunOffWall(run, objects),
  };
}

// EZD-407 (S04 Controls "Fit chip"; phase-04 EZD-407; AC-EZD-407-1; vault/build/assumptions.md EZD-407): how the
// run fits its host wall. The wall length is the host wall's extent along the run (the elevation's wall), the scribe
// the base row fillers' allowance and `tolerance` the Defaults "Cabinet fit" value (null while not set). Null for a
// run off every wall: there is no wall to fit.
export function cabinetViewFit(view: CabinetView, tolerance: number | null): CabinetRunFit | null {
  const { wall } = view.layout;
  if (wall === null) return null;
  return cabinetRunFit({
    total: view.summary.total,
    wallLength: wall.to - wall.from,
    scribe: view.summary.scribe,
    tolerance,
  });
}

// EZD-407 "click zooms to the filler": the screen has no zoom yet (EZD-404), so a click on the chip selects the base
// row's fillers, marked in both views. Empty when the row has none.
export const cabinetFitFillerIds = (view: CabinetView): string[] =>
  view.layout.base.filter((s) => s.kind === 'filler').map((s) => s.id);

// EZD-513 (11 Budgets): the selection lives in cabinet-selection.ts, which the editor entry's selection store reads, so
// the rest of this file loads with the lazy cabinet screen and not in the editor's first download.
export {
  NO_CABINET_SELECTION,
  cabinetSelect,
  isCabinetSelected,
  type CabinetSelection,
  type CabinetSelectionInput,
} from './cabinet-selection';

// EZD-405 (S04 Controls "Drag box side edge", "Drag box", "Chain dimension text | Click to type an exact width",
// "Height dimension text | Click to type upper height, ... base height", "Delete / Backspace", "Right-click box |
// ... Duplicate, Delete"; AC-EZD-405-1; vault/build/assumptions.md EZD-405): the screen's edits as model changes.
// Each builder's changes are one `applyEdit`, so one undo step. A builder returns [] when nothing changes.

const objectChange = (o: ModelObject): Change => ({
  id: o.id,
  value: {
    type: o.type,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: o.data as unknown as Record<string, unknown>,
  },
});

const memberOf = (objects: readonly ModelObject[], id: string): CabinetRunMember | null => {
  const key = id.toLowerCase();
  const o = objects.find((x) => x.id.toLowerCase() === key);
  return o !== undefined && isCabinetRunMember(o) ? o : null;
};

const inRun = (view: CabinetView, id: string) => cabinetRowOf(view.run, id) !== null;

// A member of the run at a new width; its code follows the width (B15 to B18).
export function cabinetResizeChanges(
  view: CabinetView,
  objects: readonly ModelObject[],
  id: string,
  width: number,
): Change[] {
  const m = inRun(view, id) ? memberOf(objects, id) : null;
  const next = m === null ? null : resizeCabinetMember(m, width);
  return next === null ? [] : [objectChange(next)];
}

// A member moved to place `toIndex` of its row; the others shift.
export function cabinetReorderChanges(view: CabinetView, id: string, toIndex: number): Change[] {
  const run = moveInCabinetRow(view.run, id, toIndex);
  return run === null ? [] : [objectChange(run)];
}

// Where a member dragged to `x` (inches along the run) lands in its row: after every other member of the row whose
// middle is left of `x`.
export function cabinetDropIndex(view: CabinetView, id: string, x: number): number | null {
  const row = cabinetRowOf(view.run, id);
  if (row === null) return null;
  const key = id.toLowerCase();
  const slots = view.layout[row].filter((s) => s.id.toLowerCase() !== key);
  return slots.filter((s) => s.x + s.width / 2 < x).length;
}

// The run's members among `ids` removed, and the run without them.
export function cabinetDeleteChanges(view: CabinetView, ids: readonly string[]): Change[] {
  const gone = ids.filter((id) => inRun(view, id));
  const run = removeFromCabinetRun(view.run, gone);
  if (run === null) return [];
  return [...gone.map((id) => ({ id, value: null })), objectChange(run)];
}

// A copy of each of the run's members among `ids`, each right after its original; `ids` of the result are the copies.
export function cabinetDuplicateChanges(
  view: CabinetView,
  objects: readonly ModelObject[],
  ids: readonly string[],
  newId: () => string,
): { changes: Change[]; ids: string[] } {
  let run = view.run;
  const changes: Change[] = [];
  const made: string[] = [];
  for (const id of ids) {
    const m = inRun(view, id) ? memberOf(objects, id) : null;
    if (m === null) continue;
    const copyId = newId();
    const next = insertAfterInCabinetRun(run, m.id, copyId);
    if (next === null) continue;
    run = next;
    changes.push(objectChange({ ...m, id: copyId } as ModelObject));
    made.push(copyId);
  }
  if (made.length === 0) return { changes: [], ids: [] };
  return { changes: [...changes, objectChange(run)], ids: made };
}

// A typed height dimension: Upper sets every box of the upper row to that height; Base is the countertop's top, so
// the row's counter-height members take it less the countertop's 1 1/2". Tall boxes keep theirs. The gap between
// the countertop and the uppers is not stored (EZD-404), so it is not typed.
export function cabinetHeightChanges(
  view: CabinetView,
  objects: readonly ModelObject[],
  kind: 'base' | 'upper',
  size: number,
): Change[] {
  const row: CabinetRow = kind;
  const height = kind === 'base' ? size - CABINET_COUNTERTOP_THICKNESS : size;
  if (!(height > 0)) return [];
  const changes: Change[] = [];
  for (const slot of view.layout[row]) {
    if (slot.boxType === 'tall') continue;
    const m = memberOf(objects, slot.id);
    const next = m === null ? null : reheightCabinetMember(m, height);
    if (next !== null) changes.push(objectChange(next));
  }
  return changes;
}

// EZD-733 (AC-EZD-733-1 "Changing the start point moves the cuts on the elevation"; phase-07 EZD-733; S19 "Tile pattern
// select"; vault/build/assumptions.md EZD-733): the wall tile on the face the run stands against. Add lays the default
// tile from the wall's left end in this elevation at the floor; an edit changes one or more fields. The start point is
// typed in the elevation: from the wall's left end as drawn, and up from the floor. Each is one undo step.
export type WallTileEdit = {
  pattern?: TilePattern;
  tileWidth?: number;
  tileHeight?: number;
  joint?: number;
  // From the wall's left end in the elevation, and up from the floor.
  startFromLeft?: number;
  startHeight?: number;
  // The set height the tile runs to.
  height?: number;
};

// The tile start point as the screen shows it: from the wall's left end, and up from the floor.
export function wallTileStart(view: CabinetView): { fromLeft: number; height: number } | null {
  const { tile, wall } = view.layout;
  if (tile === null || wall === null) return null;
  return { fromLeft: tile.start.x - wall.from, height: tile.start.y };
}

export function wallTileAddChanges(view: CabinetView, newId: () => string): Change[] {
  const { face, wall, tile } = view.layout;
  if (face === null || wall === null || tile !== null) return [];
  return [
    objectChange({
      id: newId(),
      type: 'tile_layout',
      data: {
        geometry: {
          host: {
            kind: 'wall',
            wallId: face.wallId,
            side: face.side,
            height: DEFAULT_WALL_TILE_HEIGHT,
          },
          start: wallStartFromElevation(face, { x: wall.from, y: 0 }),
        },
        status: 'new',
        level: view.run.data.level,
        attributes: {
          pattern: 'straight',
          tileWidth: DEFAULT_TILE_WIDTH,
          tileHeight: DEFAULT_TILE_HEIGHT,
          joint: DEFAULT_TILE_JOINT,
        },
      },
    }),
  ];
}

export function wallTileChanges(
  view: CabinetView,
  objects: readonly ModelObject[],
  e: WallTileEdit,
): Change[] {
  const { face, wall, tile } = view.layout;
  if (face === null || wall === null || tile === null) return [];
  const key = tile.id.toLowerCase();
  const o = objects.find((x) => x.id.toLowerCase() === key);
  if (o === undefined || o.type !== 'tile_layout' || o.data.geometry.host.kind !== 'wall')
    return [];
  const positive = (n: number | undefined) => n === undefined || n > 0;
  if (!positive(e.tileWidth) || !positive(e.tileHeight) || !positive(e.height)) return [];
  if (e.joint !== undefined && !(e.joint >= 0)) return [];
  const a = o.data.attributes;
  const host = o.data.geometry.host;
  const start =
    e.startFromLeft === undefined && e.startHeight === undefined
      ? o.data.geometry.start
      : wallStartFromElevation(face, {
          x: wall.from + (e.startFromLeft ?? tile.start.x - wall.from),
          y: e.startHeight ?? tile.start.y,
        });
  const next: ModelObject = {
    ...o,
    data: {
      ...o.data,
      geometry: { host: { ...host, height: e.height ?? host.height }, start },
      attributes: {
        pattern: e.pattern ?? a.pattern,
        tileWidth: e.tileWidth ?? a.tileWidth,
        tileHeight: e.tileHeight ?? a.tileHeight,
        joint: e.joint ?? a.joint,
      },
    },
  };
  return JSON.stringify(next.data) === JSON.stringify(o.data) ? [] : [objectChange(next)];
}

// EZD-408 (S04 Controls "Auto-fill run | Canvas header | Fills the selected wall run with real boxes in 3" increments
// plus fillers at walls and appliances; shows result for confirmation | Existing boxes are replaced only after
// confirm"; phase-04 EZD-408; AC-EZD-408-1; vault/build/assumptions.md EZD-408): Auto-fill as model changes. The
// replaced base-row members are removed, new boxes and fillers are made from the seeded generic line (B9 to B36, F3;
// EZD-401), and the run lists them in order with the kept sink bases and appliance panels. The upper row is left as
// it is. `fill` is null (and there are no changes) for a run off every wall. One `applyEdit`, so one undo step.
export function cabinetAutoFillChanges(
  view: CabinetView,
  objects: readonly ModelObject[],
  increment: number,
  newId: () => string,
): { changes: Change[]; fill: CabinetAutoFill | null } {
  const fill = cabinetAutoFill(view.run, objects, increment);
  if (fill === null) return { changes: [], fill: null };
  const level = view.run.data.level;
  const made: Change[] = [];
  const base: string[] = [];
  for (const s of fill.slots) {
    if (s.kind === 'keep') {
      base.push(s.id);
      continue;
    }
    const id = newId();
    base.push(id);
    const size = { width: s.width, depth: CABINET_BASE_DEPTH, height: CABINET_BASE_HEIGHT };
    const object: ModelObject =
      s.kind === 'box'
        ? {
            id,
            type: 'cabinet_box',
            data: {
              status: 'new',
              level,
              attributes: {
                code: s.code,
                boxType: 'base',
                ...size,
                // Board S04 and library rows "B9–B24 Base, 1 door", "B27–B36 Base, 2 doors".
                faceLayout: s.width > 24 ? 'drawer_doors_2' : 'drawer_door_1',
                hingeSide: s.width > 24 ? 'pair' : 'left',
                finishedEnds: 'none',
                catalogItemId: null,
                finish: null,
              },
            },
          }
        : {
            id,
            type: 'cabinet_filler',
            data: {
              status: 'new',
              level,
              attributes: {
                code: s.code,
                ...size,
                scribe: Math.min(s.scribe, s.width),
                catalogItemId: null,
                finish: null,
              },
            },
          };
    made.push(objectChange(object));
  }
  const run: CabinetRun = {
    ...view.run,
    data: {
      ...view.run.data,
      geometry: { ...view.run.data.geometry, start: fill.start },
      attributes: { ...view.run.data.attributes, base },
    },
  };
  const gone = fill.replaced.filter((id) => memberOf(objects, id) !== null);
  return {
    changes: [...gone.map((id) => ({ id, value: null })), ...made, objectChange(run)],
    fill,
  };
}

// EZD-403 (S04 Controls "Library row ... | Drag onto plan strip or elevation to insert a box; drop position sets order
// in the run", "Library row TK / LR / CM | Drag or click to add trim along the run | Each is its own object";
// AC-EZD-403-1; vault/build/assumptions.md EZD-403): a library row dropped on the run.

// Where a new member dropped at `x` (inches along the run) stands in `row`: after every member of the row whose middle
// is left of `x`.
export function cabinetInsertIndex(view: CabinetView, row: CabinetRow, x: number): number {
  return view.layout[row].filter((s) => s.x + s.width / 2 < x).length;
}

// The new member, made from the row at `width`, and the run listing it at the drop place: one edit, one undo step.
// Empty when the run cannot take it (its most members).
export function cabinetLibraryInsertChanges(
  view: CabinetView,
  row: LibraryRow,
  width: number,
  x: number,
  id: string,
  catalogItemId: string | null,
): Change[] {
  const run = insertAtInCabinetRow(view.run, row.row, cabinetInsertIndex(view, row.row, x), id);
  if (run === null) return [];
  return [objectChange(libraryObject(row, width, id, view.run.data.level, catalogItemId)), objectChange(run)];
}

// A width typed for a box just dropped from the library: the member at that width (code following) with the line's
// catalog item for that width.
export function cabinetLibraryWidthChanges(
  view: CabinetView,
  objects: readonly ModelObject[],
  id: string,
  width: number,
  catalogItemId: string | null,
): Change[] {
  const m = inRun(view, id) ? memberOf(objects, id) : null;
  if (m === null) return [];
  const next = resizeCabinetMember(m, width) ?? m;
  if (next === m && m.data.attributes.catalogItemId === catalogItemId) return [];
  return [
    objectChange({
      ...next,
      data: { ...next.data, attributes: { ...next.data.attributes, catalogItemId } },
    } as ModelObject),
  ];
}

// A trim along its row of the run; empty when the run has that trim on that row already.
export function cabinetTrimChanges(
  view: CabinetView,
  objects: readonly ModelObject[],
  trim: LibraryTrim,
  id: string,
): Change[] {
  const runKey = view.run.id.toLowerCase();
  const has = objects.some(
    (o) =>
      o.type === 'cabinet_trim' &&
      o.data.geometry.runId.toLowerCase() === runKey &&
      o.data.geometry.row === trim.row &&
      o.data.attributes.kind === trim.kind,
  );
  if (has) return [];
  const object: ModelObject = {
    id,
    type: 'cabinet_trim',
    data: {
      geometry: { runId: view.run.id, row: trim.row },
      status: 'new',
      level: view.run.data.level,
      attributes: { kind: trim.kind, height: trim.height, catalogItemId: null, finish: null },
    },
  };
  return [objectChange(object)];
}

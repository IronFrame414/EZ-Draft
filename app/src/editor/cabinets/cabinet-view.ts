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
  objectLookup,
  parseStoredObject,
  type CabinetRun,
  type CabinetRunLayout,
  type CabinetRunMember,
  type CabinetRunSummary,
  type CabinetRow,
  type ModelObject,
} from '@ezdraft/geometry';
import type { Change, Objects } from '../model/patches';

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

// The run the screen opens: the first run on the open floor (the Runs tab, EZD-403, picks another); null when the
// floor has none. `floorId` null reads every floor.
export function cabinetView(
  objects: readonly ModelObject[],
  floorId: string | null,
): CabinetView | null {
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
    offWall: isCabinetRunOffWall(run, objects),
  };
}

export type CabinetSelection = {
  readonly ids: readonly string[];
  readonly hoveredId: string | null;
};

export const NO_CABINET_SELECTION: CabinetSelection = { ids: [], hoveredId: null };

export type CabinetSelectionInput =
  | { type: 'click'; id: string | null; shift?: boolean }
  | { type: 'set'; ids: readonly string[] }
  | { type: 'hover'; id: string | null }
  | { type: 'escape' };

// A click on a box selects that box alone; Shift+click adds it to the selection or takes it out (S04 "Shift+click
// box | Adds to selection for bulk edit", EZD-405); a click off every box or Esc clears; hover marks one box. `set`
// is the selection an edit leaves (the copies after Duplicate, nothing after Delete).
export function cabinetSelect(s: CabinetSelection, i: CabinetSelectionInput): CabinetSelection {
  switch (i.type) {
    case 'click':
      if (i.id === null) return i.shift === true ? s : { ...s, ids: [] };
      if (i.shift === true) {
        const key = i.id.toLowerCase();
        const has = s.ids.some((x) => x.toLowerCase() === key);
        return { ...s, ids: has ? s.ids.filter((x) => x.toLowerCase() !== key) : [...s.ids, i.id] };
      }
      return { ...s, ids: [i.id] };
    case 'set':
      return { ...s, ids: [...i.ids] };
    case 'hover':
      return s.hoveredId === i.id ? s : { ...s, hoveredId: i.id };
    case 'escape':
      return s.ids.length === 0 ? s : { ...s, ids: [] };
  }
}

export const isCabinetSelected = (s: CabinetSelection, id: string): boolean =>
  s.ids.some((x) => x.toLowerCase() === id.toLowerCase());

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

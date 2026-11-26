// EZD-703 (S13 Rail: Viewport "Add or edit a viewport; set scale per viewport", "Plans 1/4\", elevations 1/2\"
// default"; 09h Sheet set rules "Scales per viewport", plan doc numbering "A1.0 Existing, A2.0 Demo, A3.0 Proposed";
// phase-07 EZD-703 "Existing, Demo and Proposed views driven by object status"; 03b rule 3; AC-EZD-703-1): the
// viewport rules shared by the Sheets screen and the sheet renderer. No React, no DOM.
//
// A viewport is stored on its set's sheet_set object (packages/geometry schema/sheet-set.ts). A sheet whose viewports
// were never changed stores none and shows its default viewports below; the first change to a sheet writes that
// sheet's list and marks it changed (viewportSheets), so a removed default stays removed while a sheet that joins the
// set later (A6.0 when Reflected ceiling plan is ticked, a new floor's A1.1) gets its defaults
// (vault/build/assumptions/EZD-703.md).
import type {
  ObjectStatus,
  SheetSetData,
  SheetView,
  Viewport,
  ViewportKind,
  ViewportScale,
} from '@ezdraft/geometry';
import type { SheetArea } from '@ezdraft/geometry';
import { floorCopyOf, type SheetFloor } from './sheet-set';

// A viewport as the screen shows it: a default one has no id until the set is first changed.
export type SheetViewport = Omit<Viewport, 'id'> & { id: string | null };

// Inches on paper per foot of model.
const INCHES_PER_FOOT: Readonly<Record<Exclude<ViewportScale, 'nts'>, number>> = {
  '1/8': 1 / 8,
  '3/16': 3 / 16,
  '1/4': 1 / 4,
  '3/8': 3 / 8,
  '1/2': 1 / 2,
  '3/4': 3 / 4,
  '1': 1,
  '1-1/2': 3 / 2,
  '3': 3,
};

// Paper inches per model inch, or null for not to scale (the drawing is fitted to its area).
export function viewportScaleFactor(scale: ViewportScale): number | null {
  return scale === 'nts' ? null : INCHES_PER_FOOT[scale] / 12;
}

// The printed scale, as board S13Sheets writes it (`3/4" = 1'-0"`); NTS (09h "NTS details stamped \"NTS\"").
// English only, like everything printed on a permit sheet (S13 Decision 7).
export function viewportScaleLabel(scale: ViewportScale): string {
  if (scale === 'nts') return 'NTS';
  return `${scale.replace('-', ' ')}" = 1'-0"`;
}

// The title block and status bar scale of a sheet: its one scale, AS NOTED when its viewports differ, null with none.
export const MIXED_SCALE = 'AS NOTED';
export function sheetScaleLabel(viewports: readonly Pick<SheetViewport, 'scale'>[]): string | null {
  const scales = new Set(viewports.map((v) => v.scale));
  if (scales.size === 0) return null;
  if (scales.size > 1) return MIXED_SCALE;
  return viewportScaleLabel([...scales][0]!);
}

// 09h "Scales per viewport: 1/4\" = 1'-0\" plans, 1/2\" = 1'-0\" elevations".
export const DEFAULT_SCALE: Readonly<Record<ViewportKind, ViewportScale>> = { plan: '1/4', elevation: '1/2' };

// Which stored statuses a view shows (09h numbering: A1.0 Existing, A2.0 Demo, A3.0 Proposed; AC-EZD-703-1 "A1.0
// shows existing only and A2.0 shows demo"; 09m row 4 "Existing wall set to Demo: Shown" in the Existing view):
// Existing is the house as it stands before work, so it takes what is marked Demo too and draws it as existing
// (viewDrawsAs), with no demo marks; Demo marks what is removed; Proposed is what stays plus what is built.
const VIEW_STATUSES: Readonly<Record<SheetView, readonly ObjectStatus[]>> = {
  existing: ['existing', 'demo'],
  demo: ['existing', 'demo'],
  proposed: ['existing', 'new'],
};

export function viewStatuses(view: SheetView): readonly ObjectStatus[] {
  return VIEW_STATUSES[view];
}

// The status an object of `status` is drawn in: the Existing view draws Demo objects as existing (solid, with poché).
export function viewDrawsAs(view: SheetView, status: ObjectStatus): ObjectStatus {
  return view === 'existing' && status === 'demo' ? 'existing' : status;
}

// An object with a status is shown when the view takes that status; one without (a floor) always is.
export function viewShows(view: SheetView, status: unknown): boolean {
  if (status === 'existing' || status === 'demo' || status === 'new')
    return VIEW_STATUSES[view].includes(status);
  return true;
}

// The default set's viewports (EZD-701 sheets): the plan sheets draw the lowest floor at 1/4"; A6.0's proposed plan
// draws as the reflected ceiling plan (EZD-708a, lazy/sheets/renderer.ts); E1.0 draws the proposed plan until
// EZD-708b gives it content; A4.0 holds one elevation
// viewport at 1/2" that draws the floor's elevations (EZD-707, lib/sheets/elevation-sheet.ts).
const DEFAULTS: Readonly<Record<string, readonly { kind: ViewportKind; view: SheetView }[]>> = {
  'A1.0': [{ kind: 'plan', view: 'existing' }],
  'A2.0': [{ kind: 'plan', view: 'demo' }],
  'A3.0': [{ kind: 'plan', view: 'proposed' }],
  'A4.0': [{ kind: 'elevation', view: 'proposed' }],
  'A6.0': [{ kind: 'plan', view: 'proposed' }],
  'E1.0': [{ kind: 'plan', view: 'proposed' }],
};

// A floor copy (A1.1) has its plan sheet's defaults on its own floor (Q-0509); the lowest floor's sheets name none.
export function defaultViewports(sheet: string, floors: readonly SheetFloor[] = []): SheetViewport[] {
  const copy = floorCopyOf(sheet);
  const base = copy?.base ?? sheet;
  const level = copy === null || copy.floor === 0 ? null : (floors[copy.floor]?.id ?? null);
  return (DEFAULTS[base] ?? []).map(({ kind, view }) => ({
    id: null,
    sheet,
    kind,
    level,
    view,
    scale: DEFAULT_SCALE[kind],
  }));
}

type StoredViewports = Pick<SheetSetData, 'viewports' | 'viewportSheets'>;

// Whether a sheet's viewports are the stored ones.
function changedSheet(data: StoredViewports | null, sheet: string): boolean {
  if (data === null) return false;
  return (data.viewportSheets ?? []).includes(sheet) || (data.viewports ?? []).some((v) => v.sheet === sheet);
}

export function sheetViewports(
  data: StoredViewports | null,
  sheet: string,
  floors: readonly SheetFloor[] = [],
): SheetViewport[] {
  if (!changedSheet(data, sheet)) return defaultViewports(sheet, floors);
  return (data?.viewports ?? []).filter((v) => v.sheet === sheet).map((v) => ({ ...v }));
}

// The set's viewports, sheet by sheet in set order.
export function setViewports(
  data: StoredViewports | null,
  sheets: readonly string[],
  floors: readonly SheetFloor[] = [],
): SheetViewport[] {
  return sheets.flatMap((s) => sheetViewports(data, s, floors));
}

// Whether a sheet draws any of the model (a plan viewport).
export function sheetDrawsPlan(viewports: readonly Pick<SheetViewport, 'kind'>[]): boolean {
  return viewports.some((v) => v.kind === 'plan');
}

// EZD-707: whether a sheet draws any of the model (a plan or an elevation viewport).
export function sheetDrawsModel(viewports: readonly Pick<SheetViewport, 'kind'>[]): boolean {
  return viewports.some((v) => v.kind === 'plan' || v.kind === 'elevation');
}

// EZD-707 (R24 "any other wall is added with Add elevation"; AC-EZD-707-3): the change Add elevation makes on a
// sheet: the wall joins the sheet's first elevation viewport, or a new elevation viewport (Proposed, 1/2") on the
// floor when the sheet has none. Null when that viewport already holds the wall.
export function addElevationChange(
  viewports: readonly Pick<SheetViewport, 'kind' | 'walls'>[],
  sheet: string,
  wallId: string,
  level: string | null = null,
): ViewportChange | null {
  const index = viewports.findIndex((v) => v.kind === 'elevation');
  if (index < 0)
    return {
      kind: 'add',
      viewport: { sheet, kind: 'elevation', level, view: 'proposed', scale: DEFAULT_SCALE.elevation, walls: [wallId] },
    };
  const walls = viewports[index]!.walls ?? [];
  if (walls.some((w) => w.toLowerCase() === wallId.toLowerCase())) return null;
  return { kind: 'update', index, patch: { walls: [...walls, wallId] } };
}

// A sheet's viewports share its drawing area in equal columns, left to right in list order.
export function viewportAreas(area: SheetArea, count: number): SheetArea[] {
  if (count <= 0) return [];
  const w = area.width / count;
  return Array.from({ length: count }, (_, i) => ({ x: area.x + i * w, y: area.y, width: w, height: area.height }));
}

// The new viewport the tool adds: a plan of the lowest floor in Proposed at 1/4".
export function newViewport(sheet: string): Omit<Viewport, 'id'> {
  return { sheet, kind: 'plan', level: null, view: 'proposed', scale: DEFAULT_SCALE.plan };
}

export type ViewportChange =
  | { kind: 'add'; viewport: Omit<Viewport, 'id'> }
  | { kind: 'update'; index: number; patch: Partial<Pick<Viewport, 'kind' | 'level' | 'view' | 'scale' | 'walls'>> }
  | { kind: 'remove'; index: number };

// The set's stored viewport fields after one change to `sheet`'s viewports (index is within that sheet's list). The
// sheet's defaults are written out first, each with a new id, and the sheet is marked changed; other sheets keep
// what they had. Null when the index is not on the sheet.
export function changeViewports(
  data: StoredViewports | null,
  sheet: string,
  change: ViewportChange,
  newId: () => string,
  floors: readonly SheetFloor[] = [],
): { viewports: Viewport[]; viewportSheets: string[] } | null {
  let mine: Viewport[] = sheetViewports(data, sheet, floors).map((v) => ({ ...v, id: v.id ?? newId() }));
  if (change.kind === 'add') mine = [...mine, { ...change.viewport, sheet, id: newId() }];
  else {
    const old = mine[change.index];
    if (old === undefined) return null;
    if (change.kind === 'remove') mine = mine.filter((_, i) => i !== change.index);
    else {
      const next = { ...old, ...change.patch };
      // A kind change takes that kind's default scale unless the same change sets a scale.
      if (change.patch.kind !== undefined && change.patch.kind !== old.kind && change.patch.scale === undefined)
        next.scale = DEFAULT_SCALE[change.patch.kind];
      mine = mine.map((v, i) => (i === change.index ? next : v));
    }
  }
  const others = (data?.viewports ?? []).filter((v) => v.sheet !== sheet);
  const sheets = data?.viewportSheets ?? [];
  return {
    viewports: [...others, ...mine],
    viewportSheets: sheets.includes(sheet) ? [...sheets] : [...sheets, sheet],
  };
}

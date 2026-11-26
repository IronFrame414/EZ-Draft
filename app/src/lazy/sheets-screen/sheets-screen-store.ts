// EZD-702a (S13 Layout, Controls; AC-EZD-702a-1): the Sheets screen's state, shared by its left panel, canvas and
// status bar items. It holds the project's two sets (GET /api/projects/[id]/sheet-sets, EZD-726), the chosen set and
// the open sheet, and the sheet preview's fit zoom. Opening a sheet from the list, the strip or Previous / Next all go
// through open().
// EZD-702b (phase-07 EZD-702b; 11 rule 2 "only what is on screen"; AC-EZD-702b-2): while the screen is shown it draws
// the open sheet through the sheet renderer (app/src/lazy/sheets, loaded on the first plan sheet). It watches the model
// only while shown, so an edit on the Plan tab draws no sheet; showing the screen again draws the open sheet once if
// the model changed meanwhile.
// EZD-706 (S13 Validation "Key: only symbols and abbreviations actually used; updates when objects are added or
// removed; placement per set"; AC-EZD-706-1): while shown, the open sheet's symbol key is worked out from the model
// (lib/sheets/symbol-key) on the same watch, for every sheet (the cover carries the key under "On cover only").
// EZD-1975 (AC-EZD-1975-1): a model update that changes nothing the sheet draws (a save's answer putting the server's
// numbers in the model, which can land after a return to Sheets) is not drawn again (same-drawing.ts).
// EZD-728 (AC-EZD-728-1): load() also reads the notes the set prints on its cover (GET /api/projects/[id]/notes,
// EZD-714). A failed notes answer leaves the cover without notes; it never fails the screen.
// EZD-703 (S13 Rail: Viewport; AC-EZD-703-1): the open sheet's viewports are read from the model's live sheet_set
// object (viewport-edit.ts) on the same watch; the sheet is drawn when it has a plan viewport, each viewport in its
// view and scale. editViewport() writes one viewport change to the model through the editor's store (Edit model, plus
// the edit lock, is the caller's check, as for the plan's tools). Each set's sheets follow the model's floors
// (withFloorSheets, Q-0509): a floor added or removed in the editor adds or removes its plan sheets at once.
// EZD-716 (S13 Layout "Inspector: Issue checklist"; AC-EZD-716-1): the issue checklist (GET
// /api/projects/[id]/code-check?checklist=1) is read with the sets and again each time the screen is shown, so a fix
// made on the Plan tab and saved shows here. reloadChecklist() reads it again (after a warning is accepted). The
// "Load calc complete" row is worked out here from the live model's main panel (editor/electrical, as the electrical
// status bar), with the project's edition from the answer, and again when the model changes.
// EZD-707 (R24; AC-EZD-707-1, -3): a sheet with an elevation viewport is drawn too (its floor's elevations), and the
// walls Add elevation offers for the open sheet's first elevation viewport are worked out on the same watch;
// addElevation() adds one (lib/sheets/viewport.ts addElevationChange) through editViewport.
import { parseStoredObject, type ModelObject, type SheetSetKind, type SheetSize } from '@ezdraft/geometry';
import { listFloors, resolveOpenFloor } from '../../editor/floors/floors';
import type { Change, Objects } from '../../editor/model/patches';
import { lazyModule } from '../../lib/lazy/lazy-module';
import { withFloorSheets, type SetNotes, type SheetFloor, type SheetSetSummary } from '../../lib/sheets/sheet-set';
import {
  addElevationChange,
  sheetDrawsModel,
  type SheetViewport,
  type ViewportChange,
} from '../../lib/sheets/viewport';
import { addableWalls, type AddableWall } from '../../lib/sheets/elevation-sheet';
import { schedulePage, scheduleRowsOf, withScheduleSheets } from '../../lib/sheets/cabinet-schedule-table';
import { openSheetViewports, viewportEditChange } from './viewport-edit';
import { parseSetNotes } from './cover-sheet';
import { sameDrawing } from './same-drawing';
import { sheetSymbolKey, type SheetKey } from './sheet-key';
import type { ProjectTitleBlock } from '../../lib/title-block/sheet-title-block';
import {
  issueChecklist,
  type IssueChecklist,
  type LoadCalcFacts,
  type ProjectIssueFacts,
} from '../../lib/sheets/issue-checklist';
import { panelRows } from '../../editor/electrical/electrical';
import { panelLoadCalc } from '../../editor/electrical/existing-panel';
import type { SheetRenderer } from '../sheets';

export type SheetsScreenState = {
  load: 'loading' | 'ready' | 'failed';
  sets: SheetSetSummary[];
  // EZD-710: the project's title block from the same answer; null until loaded.
  titleBlock: ProjectTitleBlock | null;
  // EZD-728: the cover's general and required notes; null until loaded or when they could not be read.
  notes: SetNotes | null;
  kind: SheetSetKind;
  // The open sheet's number; null while the chosen set has no sheets.
  open: string | null;
  // The preview's zoom (shown size over printed size), null until the preview is measured.
  zoom: number | null;
  // The open sheet's drawing: its SVG markup in paper inches, for the sheet and size it was drawn for.
  drawing: { sheet: string; size: SheetSize; markup: string } | null;
  // Sheet renders asked of the renderer since the screen was made.
  renders: number;
  // EZD-706: the open sheet's symbol key, for the set kind and sheet it was worked out for; null when it has none.
  key: { kind: SheetSetKind; sheet: string; key: SheetKey } | null;
  // EZD-703: the open sheet's viewports, in order; empty while no sheet is open. The model's floors, lowest first,
  // for the viewport tool's floor choice.
  viewports: SheetViewport[];
  floors: { id: string; name: string }[];
  // EZD-707: the walls Add elevation offers on the open sheet (those its first elevation viewport does not draw yet);
  // empty when the sheet has no elevation viewport or there is no model.
  elevationWalls: AddableWall[];
  // EZD-716: the issue checklist; null until read. `checklistLoad` is 'failed' when the last read failed.
  checklist: IssueChecklist | null;
  checklistLoad: 'loading' | 'ready' | 'failed';
};

// The model the sheets draw (the editor's routed store).
export type SheetsModelSource = {
  getState(): { objects: Objects };
  subscribe(listener: () => void): () => void;
  // EZD-703: one undoable model edit (ModelStore.applyEdit); a source without it is read-only.
  applyEdit?(changes: Change[]): string[];
};

// EZD-716: the main panel's load calc (the first panel, as the electrical status bar reads it).
export function liveLoadCalc(objects: Objects, edition: string): LoadCalcFacts {
  const main = panelRows(objects)[0];
  if (main === undefined) return { state: 'none' };
  const r = panelLoadCalc(objects, main.id);
  if (r === null) return { state: 'none' };
  if (!r.ok) return { state: 'error' };
  return { state: 'done', edition, serviceAmps: r.service?.amps ?? null, pass: r.service?.pass ?? null };
}

export type SheetsScreenDeps = { loadRenderer?: () => Promise<SheetRenderer>; newId?: () => string };

const sheetsRenderer = lazyModule(() => import('../sheets'));

export type SheetsScreen = {
  // EZD-711: the project, for the Property appraiser import dialog.
  readonly projectId: string;
  get(): SheetsScreenState;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  chooseSet(kind: SheetSetKind): void;
  open(number: string): void;
  setZoom(zoom: number | null): void;
  set(): SheetSetSummary | null;
  setModel(source: SheetsModelSource | null): void;
  setShown(shown: boolean): void;
  // EZD-703: one change to the open sheet's viewports; false when nothing was changed.
  editViewport(change: ViewportChange): boolean;
  // EZD-707: Add elevation: the wall joins the open sheet's elevations; false when nothing was changed.
  addElevation(wallId: string): boolean;
  // EZD-716: reads the issue checklist again.
  reloadChecklist(): Promise<void>;
  dispose(): void;
};

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export function createSheetsScreen(
  projectId: string,
  fetchFn: Fetch = fetch,
  deps: SheetsScreenDeps = {},
): SheetsScreen {
  let state: SheetsScreenState = {
    load: 'loading',
    sets: [],
    titleBlock: null,
    notes: null,
    kind: 'permit',
    open: null,
    zoom: null,
    drawing: null,
    renders: 0,
    key: null,
    viewports: [],
    floors: [],
    elevationWalls: [],
    checklist: null,
    checklistLoad: 'loading',
  };
  const listeners = new Set<() => void>();
  const update = (next: Partial<SheetsScreenState>) => {
    state = { ...state, ...next };
    for (const l of listeners) l();
  };
  const setOf = (kind: SheetSetKind) => state.sets.find((s) => s.kind === kind) ?? null;
  // EZD-703: the sets as loaded, before the live floors are applied; and the floors last applied.
  let loaded: SheetSetSummary[] = [];
  let floorsKey = '';
  const floorsOf = (): SheetFloor[] =>
    source === null ? [] : listFloors(source.getState().objects).map(({ id, name }) => ({ id, name }));
  // EZD-707: the model's cabinet schedule row count (for A4.0's continuation sheets); null with no model, when the
  // sets keep the server's sheets. Counted once per model.
  let counted: { objects: Objects; rows: number } | null = null;
  const scheduleRows = (): number | null => {
    if (source === null) return null;
    const objects = source.getState().objects;
    if (counted === null || counted.objects !== objects) {
      const stored = [...objects].map(([id, v]) => ({ id, type: v.type, schema_version: v.schemaVersion, data: v.data }));
      counted = { objects, rows: scheduleRowsOf(stored).length };
    }
    return counted.rows;
  };
  const withFloors = (sets: SheetSetSummary[], floors: SheetFloor[]) => {
    const rows = scheduleRows();
    return sets.map((s) => {
      const sheets = withFloorSheets(s.sheets, floors);
      return { ...s, sheets: rows === null ? sheets : withScheduleSheets(sheets, s.size, rows) };
    });
  };
  // The sets with the model's floors; the open sheet stays when it is still in the set.
  const refreshFloors = () => {
    if (state.load !== 'ready' || source === null) return;
    const floors = floorsOf();
    const key = JSON.stringify([floors, scheduleRows()]);
    if (key === floorsKey) return;
    floorsKey = key;
    const sets = withFloors(loaded, floors);
    const set = sets.find((x) => x.kind === state.kind);
    const keep = set?.sheets.some((x) => x.number === state.open) ?? false;
    update({ sets, floors, open: keep ? state.open : (set?.sheets[0]?.number ?? null) });
  };
  const firstOf = (kind: SheetSetKind) => setOf(kind)?.sheets[0]?.number ?? null;

  const loadRenderer =
    deps.loadRenderer ?? (() => sheetsRenderer.load().then((m) => m.createSheetRenderer()));
  let renderer: Promise<SheetRenderer> | null = null;
  let source: SheetsModelSource | null = null;
  let shown = false;
  let unwatch: (() => void) | null = null;
  const newId = deps.newId ?? (() => crypto.randomUUID());
  // What the last render asked for; the same model, sheet, size and viewports are not drawn again.
  let drawn: { objects: Objects; sheet: string; size: SheetSize; vps: string } | null = null;
  // EZD-1975: the latest model found to draw the same as `drawn.objects`, so it is compared once.
  let same: Objects | null = null;

  // EZD-706: the key is worked out again only when the model, set, placement or open sheet changed.
  let keyed: { objects: Objects; set: SheetSetSummary; sheet: string } | null = null;
  const refreshKey = () => {
    if (!shown || source === null || state.load !== 'ready') return;
    const set = setOf(state.kind);
    const sheet = state.open;
    if (set === null || sheet === null) {
      keyed = null;
      if (state.key !== null) update({ key: null });
      return;
    }
    const objects = source.getState().objects;
    if (keyed !== null && keyed.objects === objects && keyed.set === set && keyed.sheet === sheet) return;
    keyed = { objects, set, sheet };
    const key = sheetSymbolKey(set, sheet, objects);
    update({ key: key === null ? null : { kind: set.kind, sheet, key } });
  };

  // EZD-703: the open sheet's viewports from the model (or the loaded set while there is no model).
  let vpKey = '[]';
  const refreshViewports = () => {
    if (state.load !== 'ready') return;
    const set = setOf(state.kind);
    const sheet = state.open;
    const vps =
      set === null || sheet === null
        ? []
        : openSheetViewports(source === null ? null : source.getState().objects, set, sheet, state.floors);
    const key = JSON.stringify(vps);
    refreshElevationWalls(vps);
    if (key === vpKey) return;
    vpKey = key;
    update({ viewports: vps });
  };

  // EZD-707: worked out again only when the model or the open sheet's first elevation viewport changed.
  let wallsFor: { objects: Objects; vp: string } | null = null;
  const refreshElevationWalls = (vps: readonly SheetViewport[]) => {
    const vp = vps.find((v) => v.kind === 'elevation');
    if (source === null || vp === undefined) {
      wallsFor = null;
      if (state.elevationWalls.length > 0) update({ elevationWalls: [] });
      return;
    }
    const objects = source.getState().objects;
    const vpKeyNow = JSON.stringify([vp.level, vp.view, vp.walls ?? []]);
    if (wallsFor !== null && wallsFor.objects === objects && wallsFor.vp === vpKeyNow) return;
    wallsFor = { objects, vp: vpKeyNow };
    const level = resolveOpenFloor(objects, vp.level);
    const parsed: ModelObject[] = [];
    if (level !== null)
      for (const [id, v] of objects) {
        const r = parseStoredObject({ id, type: v.type, schema_version: v.schemaVersion, data: v.data });
        if (r.ok) parsed.push(r.object);
      }
    const next = level === null ? [] : addableWalls(parsed, level, vp.walls ?? []);
    if (JSON.stringify(next) !== JSON.stringify(state.elevationWalls)) update({ elevationWalls: next });
  };

  // EZD-716: the latest read wins; an older answer landing after it is dropped. The facts read, and the model the
  // load calc was last worked out for.
  let checklistRead = 0;
  let facts: { facts: ProjectIssueFacts; checklist: IssueChecklist } | null = null;
  let calcFor: Objects | null = null;
  const refreshChecklist = (force = false) => {
    if (facts === null) return;
    if (source === null) {
      if (force) update({ checklist: facts.checklist, checklistLoad: 'ready' });
      return;
    }
    const objects = source.getState().objects;
    if (!force && objects === calcFor) return;
    calcFor = objects;
    const next = issueChecklist({ ...facts.facts, loadCalc: liveLoadCalc(objects, facts.facts.edition) });
    if (force || JSON.stringify(next) !== JSON.stringify(state.checklist))
      update({ checklist: next, checklistLoad: 'ready' });
  };
  const reloadChecklist = async () => {
    const n = ++checklistRead;
    if (state.checklist === null) update({ checklistLoad: 'loading' });
    try {
      const res = await fetchFn(`/api/projects/${projectId}/code-check?checklist=1`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as Partial<{ facts: ProjectIssueFacts; checklist: IssueChecklist }>;
      if (typeof body.facts !== 'object' || body.facts === null || typeof body.checklist !== 'object')
        throw new Error('bad_answer');
      if (n !== checklistRead) return;
      facts = { facts: body.facts, checklist: body.checklist as IssueChecklist };
      refreshChecklist(true);
    } catch {
      if (n === checklistRead) update({ checklistLoad: 'failed' });
    }
  };

  // One render at a time: a change while one is drawing is drawn when it ends.
  let busy = false;
  const refresh = () => {
    refreshFloors();
    refreshChecklist();
    refreshKey();
    if (shown) refreshViewports();
    if (busy || !shown || source === null || state.load !== 'ready') return;
    const set = setOf(state.kind);
    const sheet = set?.sheets.find((s) => s.number === state.open) ?? null;
    if (set === null || sheet === null) return;
    if (!sheetDrawsModel(state.viewports) && schedulePage(sheet.number) === null) {
      // No plan or elevation viewport left on the open sheet: its old drawing goes.
      drawn = null;
      same = null;
      if (state.drawing !== null && state.drawing.sheet === sheet.number) update({ drawing: null });
      return;
    }
    const viewports = state.viewports;
    const asked = { objects: source.getState().objects, sheet: sheet.number, size: set.size, vps: vpKey };
    if (drawn !== null && drawn.sheet === asked.sheet && drawn.size === asked.size && drawn.vps === asked.vps) {
      if (drawn.objects === asked.objects || same === asked.objects) return;
      if (sameDrawing(drawn.objects, asked.objects)) {
        same = asked.objects;
        return;
      }
    }
    drawn = asked;
    same = null;
    busy = true;
    update({ renders: state.renders + 1 });
    renderer ??= loadRenderer();
    renderer
      .then((r) => r.render({ objects: asked.objects, size: asked.size, viewports, sheet: asked.sheet }))
      .then(
        (svg) => {
          busy = false;
          if (drawn === asked)
            update({
              drawing: svg === null ? null : { sheet: asked.sheet, size: asked.size, markup: svg.markup },
            });
          refresh();
        },
        () => {
          // A failed load or job leaves the sheet's frame; the next change or showing tries again.
          busy = false;
          renderer = null;
          if (drawn === asked) drawn = null;
        },
      );
  };

  const screen: SheetsScreen = {
    projectId,
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async load() {
      update({ load: 'loading' });
      void reloadChecklist();
      const notes = fetchFn(`/api/projects/${projectId}/notes`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then(parseSetNotes, () => null);
      try {
        const res = await fetchFn(`/api/projects/${projectId}/sheet-sets`, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { sets: SheetSetSummary[]; titleBlock?: ProjectTitleBlock };
        loaded = body.sets;
        floorsKey = '';
        const floors = source === null ? state.floors : floorsOf();
        state = {
          ...state,
          sets: withFloors(loaded, floors),
          floors,
          titleBlock: body.titleBlock ?? null,
          notes: await notes,
        };
        const keep = setOf(state.kind)?.sheets.some((s) => s.number === state.open);
        update({ load: 'ready', open: keep ? state.open : firstOf(state.kind) });
        refresh();
      } catch {
        update({ load: 'failed' });
      }
    },
    chooseSet(kind) {
      if (kind === state.kind) return;
      update({ kind, open: firstOf(kind) });
      refresh();
    },
    open(number) {
      if (number === state.open) return;
      if (!setOf(state.kind)?.sheets.some((s) => s.number === number)) return;
      update({ open: number });
      refresh();
    },
    setZoom(zoom) {
      if (zoom !== state.zoom) update({ zoom });
    },
    set: () => setOf(state.kind),
    setModel(next) {
      if (next === source) return;
      unwatch?.();
      unwatch = null;
      source = next;
      drawn = null;
      if (shown && source !== null) unwatch = source.subscribe(refresh);
      refresh();
    },
    setShown(next) {
      if (next === shown) return;
      shown = next;
      unwatch?.();
      unwatch = null;
      if (shown && source !== null) unwatch = source.subscribe(refresh);
      if (shown && state.load === 'ready') void reloadChecklist();
      refresh();
    },
    editViewport(change) {
      const set = setOf(state.kind);
      const sheet = state.open;
      if (source?.applyEdit === undefined || set === null || sheet === null || state.load !== 'ready') return false;
      const c = viewportEditChange(source.getState().objects, set, sheet, change, newId, state.floors);
      if (c === null) return false;
      source.applyEdit([c]);
      refresh();
      return true;
    },
    addElevation(wallId) {
      const sheet = state.open;
      if (sheet === null) return false;
      const lowest = state.floors[0]?.id ?? null;
      const change = addElevationChange(state.viewports, sheet, wallId, lowest);
      return change === null ? false : screen.editViewport(change);
    },
    reloadChecklist,
    dispose() {
      unwatch?.();
      unwatch = null;
      shown = false;
      const r = renderer;
      renderer = null;
      void r?.then((x) => x.dispose(), () => {});
    },
  };
  return screen;
}

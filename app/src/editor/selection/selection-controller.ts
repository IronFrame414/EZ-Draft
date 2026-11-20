// EZD-208a Build step 8 (vault/plans/EZD-208a.md section 3 A10-A13; section 1 R3-R9, R14, R15, R18; S03 Canvas
// interactions; Q-0630 rows 7, 9, 28, 33, 35, 36; Q-0633 G12; 11 rule 4): canvas selection outside React. Click,
// repeated click, Shift and Select more, the box by direction, Esc, V and Select all; session state only. The box
// goes to `onBox` per move, never through `getUi()`.
// EZD-208b Build step 4a (DB20; B9)
// EZD-212b (vault/plans/EZD-212b.md D8): `pickAt`, and a press on an object hands its drag to the drawing controller.
// EZD-212c (vault/plans/EZD-212c.md step 6b, D14): Esc asks the drawing first while a handle or chip entry is open.
// EZD-213b (vault/plans/EZD-213b.md step 7, D-Dblclick): a dblclick selects the smallest object and tells onDoubleClick.
// EZD-6001 (vault/plans/EZD-6001.md D-Wire): picks come from the chosen floor; a switch empties the selection.
// EZD-231: Measure on every viewer's rail (`editorRail`).
// EZD-233 (S03 Context menu "Group"): a click, Shift-click, drag hand-over or box that takes a grouped object takes
// its whole group.
// EZD-218 (Q-0677 (a); AC-EZD-218-5): rooms are picked by a click, a box and Select all, but a press with no other
// object under it still starts a box, even inside a room, and a room is never dragged. A room draws its outline.
import { DEFAULT_BINDINGS, commandForKey, type ShortcutBindings } from '../../lib/defaults/shortcut-keys';
import type { Point } from '@ezdraft/geometry';
import type { RailTool } from '../../components/shell/rail-types';
import type { ModelStore } from '../model/model-store';
import { chosenFloor, type FloorChoice } from '../floors/floors';
import type { Objects } from '../model/patches';
import { openFloorId } from '../plan/batches';
import type { PlanCanvasHandle } from '../plan/controller';
import {
  HOVER_CAPTURE_PX,
  type BodyLookup,
  type HoverPicker,
  type OutlineLookup,
} from '../plan/hover';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import type { DrawingController, ToolKeyEvent } from '../tools/drawing-controller';
import { railMode } from '../tools/rail-mode';
import {
  CABINETS_RAIL_TOOL,
  COUNTERTOPS_RAIL_TOOL,
  DRAWING_RAIL_TOOLS,
  ELECTRICAL_RAIL_TOOL,
  MEASURE_RAIL_TOOL,
} from '../tools/tool-defs';
import { isTypingTarget } from '../typed-entry/typed-entry';
import { expandGroups } from './groups';
import type { PhaseFilter } from '../../lib/plan/phase-view';
import { createPickIndex } from './pick-index';

export const SELECT_RAIL_TOOL: RailTool = {
  kind: 'tool',
  id: 'select',
  icon: 'arrow_selector_tool',
  label: 'office.tool.select',
  shortcut: 'V',
};

export const SAME_SPOT_PX = 10;

export type SelectionUi = { readonly ids: readonly string[]; readonly selectMore: boolean };

export type SelectionBox = { from: Point; to: Point; mode: 'inside' | 'touch' };

export type SelectionHandle = Pick<
  PlanCanvasHandle,
  | 'getPixelsPerInch'
  | 'screenToModel'
  | 'setHoverMode'
  | 'setHoverPicker'
  | 'setBodyLookup'
  | 'setSelectedIds'
> &
  Partial<Pick<PlanCanvasHandle, 'setOutlineLookup'>>;

export type SelectionDeps = {
  handle: SelectionHandle;
  store: Pick<ModelStore, 'getState' | 'subscribe'>;
  drawing:
    | (Pick<DrawingController, 'getUi' | 'keyDown' | 'selectTool'> &
        Partial<Pick<DrawingController, 'startDrag' | 'dragPointer' | 'subscribe'>>)
    | null;
  setReceiver: (r: PlanPointerReceiver | null) => void;
  claim?: (event: PlanPointerEvent) => boolean;
  // EZD-214 (Q-0671 (a)): what the phase view hides is not picked, and leaves the selection when it becomes hidden.
  phase?: PhaseFilter & { subscribe(listener: () => void): () => void };
  // EZD-6001 D-Wire: the floor the user chose; without it the lowest floor is picked from.
  floors?: FloorChoice;
  // EZD-222 (S15d Keyboard shortcuts): the company key map in force; the default map without it.
  keys?: () => ShortcutBindings;
};

export type ReceiverSlots = {
  drawing(r: PlanPointerReceiver | null): void;
  selection(r: PlanPointerReceiver | null): void;
};

export type SelectionController = {
  getUi(): SelectionUi;
  subscribe(listener: () => void): () => void;
  getBox(): SelectionBox | null;
  onBox(listener: (box: SelectionBox | null) => void): () => void;
  keyDown(e: ToolKeyEvent): boolean;
  selectTool(): void;
  selectAll(): void;
  setSelectMore(on: boolean): void;
  select(ids: readonly string[]): void;
  clear(): void;
  pickAt(model: Point): string[];
  onDoubleClick(listener: (id: string) => void): () => void;
  dispose(): void;
};

type Press = {
  screen: Point;
  model: Point;
  candidates: string[];
  // The candidates without rooms: these decide a drag hand-over or a box.
  solid: string[];
  dragged: boolean;
  dragging: boolean;
};

const ESCAPE: ToolKeyEvent = {
  key: 'Escape',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  defaultPrevented: false,
  target: null,
};

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const noop = () => {};

export function createSelectionController(deps: SelectionDeps): SelectionController {
  const { handle, store, drawing, setReceiver } = deps;
  const phase = deps.phase ?? null;
  const index = createPickIndex();
  let ui: SelectionUi = { ids: [], selectMore: false };
  let cycle: { at: Point; i: number } | null = null;
  let press: Press | null = null;
  let box: SelectionBox | null = null;
  let disposed = false;
  const uiListeners = new Set<() => void>();
  const boxListeners = new Set<(box: SelectionBox | null) => void>();
  const doubleClickListeners = new Set<(id: string) => void>();

  const tolerance = () => HOVER_CAPTURE_PX / handle.getPixelsPerInch();

  // R18: a new SelectionUi, then the canvas, then the ui listeners.
  const setUi = (ids: readonly string[], selectMore: boolean = ui.selectMore) => {
    const idsChanged = !sameIds(ids, ui.ids);
    if (!idsChanged && selectMore === ui.selectMore) return;
    ui = { ids: idsChanged ? [...ids] : ui.ids, selectMore };
    if (idsChanged) handle.setSelectedIds(ui.ids);
    for (const l of [...uiListeners]) l();
  };

  const setBox = (next: SelectionBox | null) => {
    box = next;
    for (const l of [...boxListeners]) l(next);
  };

  const dropPress = () => {
    press = null;
    if (box !== null) setBox(null);
  };

  // EZD-233: the ids with every member of their groups that the index holds.
  const grouped = (ids: readonly string[]): string[] =>
    expandGroups(store.getState().objects, ids).filter((id) => index.has(id));

  const click = (p: Press, shiftKey: boolean) => {
    const c = p.candidates;
    if (shiftKey || ui.selectMore) {
      cycle = null;
      if (c.length === 0) return;
      const first = c[0]!.toLowerCase();
      const selected = ui.ids.some((id) => id.toLowerCase() === first);
      const group = new Set(grouped([c[0]!]).map((id) => id.toLowerCase()));
      setUi(
        selected
          ? ui.ids.filter((id) => !group.has(id.toLowerCase()))
          : grouped([...ui.ids, c[0]!]),
      );
      return;
    }
    if (c.length === 0) {
      cycle = null;
      setUi([]);
      return;
    }
    const i =
      cycle !== null && distance(p.screen, cycle.at) <= SAME_SPOT_PX ? (cycle.i + 1) % c.length : 0;
    // Cycle first: setUi re-runs the hover picker, which reads it (R10, R12).
    cycle = { at: p.screen, i };
    setUi(grouped([c[i]!]));
  };

  // D8: the drag moves the selection when a candidate is in it, else the first candidate alone.
  const handOver = (p: Press) => {
    if (drawing === null || !drawing.getUi().enabled || drawing.startDrag === undefined) return;
    const c = p.solid;
    const inSelection = c.some((id) => ui.ids.some((s) => s.toLowerCase() === id.toLowerCase()));
    if (!inSelection) {
      cycle = null;
      setUi(grouped([c[0]!]));
    }
    p.dragging = true;
    drawing.startDrag(
      ui.ids.filter((id) => !index.isRoom(id)),
      p.model,
    );
  };

  const boxMode = (from: Point, to: Point): SelectionBox['mode'] =>
    to.x >= from.x ? 'inside' : 'touch';

  const receiver: PlanPointerReceiver = (e: PlanPointerEvent) => {
    if (deps.claim?.(e) === true) return;
    if (disposed) return;
    if (e.kind === 'down') {
      if (press !== null) dropPress();
      const candidates = index.pick(e.model, tolerance());
      press = {
        screen: e.screen,
        model: e.model,
        candidates,
        solid: candidates.filter((id) => !index.isRoom(id)),
        dragged: false,
        dragging: false,
      };
      return;
    }
    // D8: a handed-over drag gets every later move, up and cancel; up and cancel end the press with no click.
    if (press !== null && press.dragging) {
      if (e.kind === 'move' || e.kind === 'up' || e.kind === 'cancel') {
        drawing?.dragPointer?.(e);
        if (e.kind !== 'move') {
          press = null;
          cycle = null;
        }
      }
      return;
    }
    if (e.kind === 'move') {
      if (cycle !== null && distance(e.screen, cycle.at) > SAME_SPOT_PX) cycle = null;
      if (press === null) return;
      if (!press.dragged && distance(e.screen, press.screen) > SAME_SPOT_PX) {
        press.dragged = true;
        if (press.solid.length > 0) handOver(press);
      }
      if (press.dragged && press.solid.length === 0) {
        setBox({ from: press.screen, to: e.screen, mode: boxMode(press.screen, e.screen) });
      }
      return;
    }
    if (e.kind === 'up') {
      if (press === null) return;
      const p = press;
      press = null;
      const dragged = p.dragged || distance(e.screen, p.screen) > SAME_SPOT_PX;
      if (!dragged) {
        click(p, e.shiftKey);
        return;
      }
      if (p.solid.length === 0) {
        const rect = {
          minX: Math.min(p.model.x, e.model.x),
          minY: Math.min(p.model.y, e.model.y),
          maxX: Math.max(p.model.x, e.model.x),
          maxY: Math.max(p.model.y, e.model.y),
        };
        cycle = null;
        setUi(grouped(index.inRect(rect, boxMode(p.screen, e.screen))));
      }
      if (box !== null) setBox(null);
      return;
    }
    if (e.kind === 'cancel') {
      if (press === null) return;
      dropPress();
      return;
    }
    if (e.kind === 'dblclick') {
      if (e.shiftKey || ui.selectMore) return;
      const c = index.pick(e.model, tolerance());
      if (c.length === 0) return;
      cycle = { at: e.screen, i: 0 };
      setUi([c[0]!]);
      for (const l of [...doubleClickListeners]) l(c[0]!);
    }
    // `click` is ignored (R4).
  };

  const picker: HoverPicker = (screen) => {
    const c = index.pick(handle.screenToModel(screen), tolerance());
    if (c.length === 0) return null;
    if (cycle !== null && distance(screen, cycle.at) <= SAME_SPOT_PX) {
      return c[(cycle.i + 1) % c.length]!;
    }
    return c[0]!;
  };

  const bodyLookup: BodyLookup = (id) => index.body(id);
  const outlineLookup: OutlineLookup = (id) => index.outline(id);

  const clearSelection = () => {
    cycle = null;
    setUi([]);
  };

  // EZD-613: Esc while the drawing engine still loads is held and answered when it loads, so the tool may turn
  // off after keyDown returns. Until the tool next changes, a change to no tool clears the selection, as an Esc
  // the engine answered at once does (EZD-208b B7).
  let offEscapeWait: (() => void) | null = null;
  const stopEscapeWait = () => {
    offEscapeWait?.();
    offEscapeWait = null;
  };
  const waitForEscape = (tool: unknown) => {
    if (drawing === null || drawing.subscribe === undefined) return;
    stopEscapeWait();
    offEscapeWait = drawing.subscribe(() => {
      const now = drawing.getUi().tool;
      if (now === tool) return;
      stopEscapeWait();
      if (now === null) clearSelection();
    });
  };

  const escape = (e: ToolKeyEvent): boolean => {
    if (press !== null && box !== null) {
      dropPress();
      return true;
    }
    if (drawing !== null) {
      const before = drawing.getUi();
      if (before.tool !== null || before.pick !== null || before.entry !== null) {
        const r = drawing.keyDown(e);
        const after = drawing.getUi();
        if (before.tool !== null && after.tool === null) clearSelection();
        else if (before.tool !== null && after.tool === before.tool) waitForEscape(after.tool);
        return r;
      }
    }
    if (ui.ids.length > 0 || ui.selectMore) {
      cycle = null;
      setUi([], false);
      return true;
    }
    return false;
  };

  const selectToolStep = (): boolean => {
    if (drawing === null) return false;
    const d = drawing.getUi();
    if (d.tool !== null) {
      drawing.selectTool(null);
      clearSelection();
      return true;
    }
    if (d.pick !== null) {
      drawing.keyDown({ ...ESCAPE });
      return true;
    }
    return false;
  };

  const selectAll = () => {
    if (disposed) return;
    cycle = null;
    setUi(index.all());
  };

  const floorOf = (o: Objects) => openFloorId(o, chosenFloor(deps.floors));
  const objects = store.getState().objects;
  index.sync(objects, floorOf(objects), [], phase);
  handle.setBodyLookup(bodyLookup);
  handle.setOutlineLookup?.(outlineLookup);
  handle.setHoverPicker(picker);
  handle.setHoverMode('select');
  setReceiver(receiver);

  // R15: keep the index current, drop ids that left the floor or the model, then redraw (R12).
  const unsubscribe = store.subscribe((state, prev) => {
    if (disposed || state.objects === prev.objects) return;
    const floor = floorOf(state.objects);
    const floorChanged = floor !== index.floorId;
    index.sync(state.objects, floor, state.lastChangedIds, phase);
    const next = floorChanged ? [] : ui.ids.filter((id) => index.has(id));
    cycle = null;
    const changed = !sameIds(next, ui.ids);
    setUi(next);
    if (!changed) handle.setSelectedIds(ui.ids);
  });
  const unsubscribePhase =
    phase === null
      ? noop
      : phase.subscribe(() => {
          if (disposed) return;
          const now = store.getState().objects;
          index.sync(now, floorOf(now), [], phase);
          cycle = null;
          setUi(ui.ids.filter((id) => index.has(id)));
        });
  // EZD-6001 D-Wire: a switch to another floor empties the selection, as a floor change in the model does.
  const unsubscribeFloors =
    deps.floors === undefined
      ? noop
      : deps.floors.subscribe(() => {
          if (disposed) return;
          const now = store.getState().objects;
          const floor = floorOf(now);
          if (floor === index.floorId) return;
          index.sync(now, floor, [], phase);
          cycle = null;
          const changed = ui.ids.length > 0;
          setUi([]);
          if (!changed) handle.setSelectedIds(ui.ids);
        });

  return {
    getUi: () => ui,
    subscribe(listener) {
      if (disposed) return noop;
      uiListeners.add(listener);
      return () => void uiListeners.delete(listener);
    },
    getBox: () => box,
    onBox(listener) {
      if (disposed) return noop;
      boxListeners.add(listener);
      return () => void boxListeners.delete(listener);
    },
    keyDown(e) {
      if (disposed || e.defaultPrevented || isTypingTarget(e.target)) return false;
      if (e.key === 'Escape') return escape(e);
      if (commandForKey(deps.keys?.() ?? DEFAULT_BINDINGS, e) === 'select') {
        return selectToolStep();
      }
      if ((e.key === 'a' || e.key === 'A') && (e.ctrlKey || e.metaKey) && !e.altKey) {
        // EZD-404: the plan is hidden under the cabinet screen; Select all would pick objects no one can see.
        if (drawing?.getUi().tool === 'cabinets' || drawing?.getUi().tool === 'countertops')
          return false;
        selectAll();
        return true;
      }
      return drawing?.keyDown(e) ?? false;
    },
    selectTool() {
      if (disposed) return;
      selectToolStep();
    },
    selectAll,
    setSelectMore(on) {
      if (disposed) return;
      cycle = null;
      setUi(ui.ids, on);
    },
    select(ids) {
      if (disposed) return;
      const want = new Set(ids.filter((id) => index.has(id)).map((id) => id.toLowerCase()));
      cycle = null;
      setUi(index.all().filter((id) => want.has(id.toLowerCase())));
    },
    clear() {
      if (disposed) return;
      clearSelection();
    },
    pickAt: (model) => index.pick(model, tolerance()),
    onDoubleClick(listener) {
      if (disposed) return noop;
      doubleClickListeners.add(listener);
      return () => void doubleClickListeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopEscapeWait();
      unsubscribe();
      unsubscribePhase();
      unsubscribeFloors();
      press = null;
      box = null;
      handle.setSelectedIds([]);
      handle.setHoverPicker(null);
      handle.setBodyLookup(null);
      handle.setOutlineLookup?.(null);
      setReceiver(null);
      uiListeners.clear();
      boxListeners.clear();
      doubleClickListeners.clear();
    },
  };
}

export function shareReceiver(set: (r: PlanPointerReceiver | null) => void): ReceiverSlots {
  let drawingReceiver: PlanPointerReceiver | null = null;
  let selectionReceiver: PlanPointerReceiver | null = null;
  let current: PlanPointerReceiver | null = null;
  const apply = () => {
    const next = drawingReceiver ?? selectionReceiver;
    if (next === current) return;
    current = next;
    set(next);
  };
  return {
    drawing(r) {
      drawingReceiver = r;
      apply();
    },
    selection(r) {
      selectionReceiver = r;
      apply();
    },
  };
}

// EZD-231 (04 Tool rail; S06 Measure "Allowed in view only"): Measure ends the top group for every viewer.
// EZD-404 (S04 Permissions; board S04 rail): Cabinets follows Window for every viewer and is never paused.
// EZD-601 (S06 Permissions "View ... circuits: View projects"; board S06Electrical rail): Electrical follows Cabinets,
// for every viewer and never paused.
// EZD-412 (S04b Entry points "Countertops (K) tool on the rail"; S04b Permissions "View projects: view pieces"; board
// S04bCountertops rail, after Cabinets): Countertops follows Cabinets, for every viewer and never paused.
const withCabinets = (tools: readonly RailTool[]): RailTool[] => {
  const i = tools.findIndex((t) => t.id === 'window');
  return [
    ...tools.slice(0, i + 1),
    CABINETS_RAIL_TOOL,
    COUNTERTOPS_RAIL_TOOL,
    ELECTRICAL_RAIL_TOOL,
    ...tools.slice(i + 1),
  ];
};
const ALL_TOOLS: readonly RailTool[] = [
  SELECT_RAIL_TOOL,
  ...withCabinets(DRAWING_RAIL_TOOLS),
  MEASURE_RAIL_TOOL,
];
const SELECT_ONLY: readonly RailTool[] = [
  SELECT_RAIL_TOOL,
  CABINETS_RAIL_TOOL,
  COUNTERTOPS_RAIL_TOOL,
  ELECTRICAL_RAIL_TOOL,
  MEASURE_RAIL_TOOL,
];

// EZD-225 (S06:48, 100; Q-0697 decisions 05): the drawing tools a lock-denied viewer sees paused; Select and Measure
// stay on (S06 States "selecting, panning, zooming, measuring ... allowed"; vault/build/assumptions.md EZD-231).
export const PAUSED_TOOL_IDS: readonly string[] = DRAWING_RAIL_TOOLS.map((t) => t.id);

// `canEdit` is "may edit now" (Edit model and holding the lock); `canEditModel` is the Edit model switch alone.
// Without Edit model the drawing tools are hidden (Q-0214; Q-0697); with it but without the lock they show paused.
export function editorRail(o: {
  editor: 'loading' | 'ready' | 'failed' | 'no-access' | 'not-found';
  canEdit: boolean;
  canEditModel?: boolean;
  canvasFailed: boolean;
  controllerEnabled: boolean;
}): { tools: readonly RailTool[]; disabled: boolean; paused?: readonly string[] } | null {
  if (o.editor === 'loading') return { tools: ALL_TOOLS, disabled: true };
  if (o.editor !== 'ready') return null;
  if (o.canEdit) return { tools: ALL_TOOLS, disabled: railMode(o) === 'disabled' };
  if (o.canEditModel === true)
    return { tools: ALL_TOOLS, disabled: o.canvasFailed, paused: PAUSED_TOOL_IDS };
  return { tools: SELECT_ONLY, disabled: o.canvasFailed };
}

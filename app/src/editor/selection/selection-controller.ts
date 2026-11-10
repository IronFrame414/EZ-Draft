// EZD-208a Build step 8 (vault/plans/EZD-208a.md section 3 A10-A13; section 1 R3-R9, R14, R15, R18; S03 Canvas
// interactions; Q-0630 rows 7, 9, 28, 33, 35, 36; Q-0633 G12; 11 rule 4): canvas selection outside React. Click,
// repeated click, Shift and Select more, the box by direction, Esc, V and Select all; session state only. The box
// goes to `onBox` per move, never through `getUi()`.
// EZD-208b Build step 4a (DB20; B9)
import type { Point } from '@ezdraft/geometry';
import type { RailTool } from '../../components/shell/rail-types';
import type { ModelStore } from '../model/model-store';
import { openFloorId } from '../plan/batches';
import type { PlanCanvasHandle } from '../plan/controller';
import { HOVER_CAPTURE_PX, type BodyLookup, type HoverPicker } from '../plan/hover';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import { railMode, type DrawingController, type ToolKeyEvent } from '../tools/drawing-controller';
import { DRAWING_RAIL_TOOLS } from '../tools/index';
import { isTypingTarget } from '../typed-entry/typed-entry';
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
>;

export type SelectionDeps = {
  handle: SelectionHandle;
  store: Pick<ModelStore, 'getState' | 'subscribe'>;
  drawing: Pick<DrawingController, 'getUi' | 'keyDown' | 'selectTool'> | null;
  setReceiver: (r: PlanPointerReceiver | null) => void;
  claim?: (event: PlanPointerEvent) => boolean;
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
  dispose(): void;
};

type Press = { screen: Point; model: Point; candidates: string[]; dragged: boolean };

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
  const index = createPickIndex();
  let ui: SelectionUi = { ids: [], selectMore: false };
  let cycle: { at: Point; i: number } | null = null;
  let press: Press | null = null;
  let box: SelectionBox | null = null;
  let disposed = false;
  const uiListeners = new Set<() => void>();
  const boxListeners = new Set<(box: SelectionBox | null) => void>();

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

  const click = (p: Press, shiftKey: boolean) => {
    const c = p.candidates;
    if (shiftKey || ui.selectMore) {
      cycle = null;
      if (c.length === 0) return;
      const first = c[0]!.toLowerCase();
      const selected = ui.ids.some((id) => id.toLowerCase() === first);
      setUi(selected ? ui.ids.filter((id) => id.toLowerCase() !== first) : [...ui.ids, c[0]!]);
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
    setUi([c[i]!]);
  };

  const boxMode = (from: Point, to: Point): SelectionBox['mode'] =>
    to.x >= from.x ? 'inside' : 'touch';

  const receiver: PlanPointerReceiver = (e: PlanPointerEvent) => {
    if (deps.claim?.(e) === true) return;
    if (disposed) return;
    if (e.kind === 'down') {
      if (press !== null) dropPress();
      press = {
        screen: e.screen,
        model: e.model,
        candidates: index.pick(e.model, tolerance()),
        dragged: false,
      };
      return;
    }
    if (e.kind === 'move') {
      if (cycle !== null && distance(e.screen, cycle.at) > SAME_SPOT_PX) cycle = null;
      if (press === null) return;
      if (!press.dragged && distance(e.screen, press.screen) > SAME_SPOT_PX) press.dragged = true;
      if (press.dragged && press.candidates.length === 0) {
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
      if (p.candidates.length === 0) {
        const rect = {
          minX: Math.min(p.model.x, e.model.x),
          minY: Math.min(p.model.y, e.model.y),
          maxX: Math.max(p.model.x, e.model.x),
          maxY: Math.max(p.model.y, e.model.y),
        };
        cycle = null;
        setUi(index.inRect(rect, boxMode(p.screen, e.screen)));
      }
      if (box !== null) setBox(null);
      return;
    }
    if (e.kind === 'cancel') {
      if (press === null) return;
      dropPress();
    }
    // `click` and `dblclick` are ignored (R4).
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

  const clearSelection = () => {
    cycle = null;
    setUi([]);
  };

  const escape = (e: ToolKeyEvent): boolean => {
    if (press !== null && box !== null) {
      dropPress();
      return true;
    }
    if (drawing !== null) {
      const before = drawing.getUi();
      if (before.tool !== null || before.pick !== null) {
        const r = drawing.keyDown(e);
        if (before.tool !== null && drawing.getUi().tool === null) clearSelection();
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

  const objects = store.getState().objects;
  index.sync(objects, openFloorId(objects), []);
  handle.setBodyLookup(bodyLookup);
  handle.setHoverPicker(picker);
  handle.setHoverMode('select');
  setReceiver(receiver);

  // R15: keep the index current, drop ids that left the floor or the model, then redraw (R12).
  const unsubscribe = store.subscribe((state, prev) => {
    if (disposed || state.objects === prev.objects) return;
    const floor = openFloorId(state.objects);
    const floorChanged = floor !== index.floorId;
    index.sync(state.objects, floor, state.lastChangedIds);
    const next = floorChanged ? [] : ui.ids.filter((id) => index.has(id));
    cycle = null;
    const changed = !sameIds(next, ui.ids);
    setUi(next);
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
      if ((e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        return selectToolStep();
      }
      if ((e.key === 'a' || e.key === 'A') && (e.ctrlKey || e.metaKey) && !e.altKey) {
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
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      press = null;
      box = null;
      handle.setSelectedIds([]);
      handle.setHoverPicker(null);
      handle.setBodyLookup(null);
      setReceiver(null);
      uiListeners.clear();
      boxListeners.clear();
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

const ALL_TOOLS: readonly RailTool[] = [SELECT_RAIL_TOOL, ...DRAWING_RAIL_TOOLS];
const SELECT_ONLY: readonly RailTool[] = [SELECT_RAIL_TOOL];

export function editorRail(o: {
  editor: 'loading' | 'ready' | 'failed' | 'no-access' | 'not-found';
  canEdit: boolean;
  canvasFailed: boolean;
  controllerEnabled: boolean;
}): { tools: readonly RailTool[]; disabled: boolean } | null {
  if (o.editor === 'loading') return { tools: ALL_TOOLS, disabled: true };
  if (o.editor !== 'ready') return null;
  if (o.canEdit) return { tools: ALL_TOOLS, disabled: railMode(o) === 'disabled' };
  return { tools: SELECT_ONLY, disabled: o.canvasFailed };
}

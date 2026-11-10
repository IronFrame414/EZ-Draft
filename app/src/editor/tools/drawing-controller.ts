// Drawing controller (EZD-210b; vault/plans/EZD-210b.md section 3 C5-C12, Decided "Enabled", "Caches", "Snap
// index", "Snap call", "Tool context", "Pointer to input", "Apply a step", "Typed", "selectTool(id)", "Keys",
// "Pick", "Keep", "Boxes", "Frame", "Messages", "lastValues", "Rail mode"; Q-0564; Q-0568; Q-0570; Q-0589 (a);
// 11 rule 4). A plain module over the plan canvas handle: it owns the tool state, the snap index and the pointer
// receiver outside React. `getUi()` changes on tool, pick, gap and last-length changes, never per pointer move.
// EZD-208a Build step 6 (vault/plans/EZD-208a.md section 1 R13; Q-0570): the hover mode is 'select' unless a tool
// is on ('off') or a gap pick is on ('wall'), and follows every ui change.
import {
  createWallSnapIndex,
  snap,
  wallLength,
  type ModelObject,
  type Point,
  type SnapResult,
  type WallObject,
  type WallSnapIndex,
} from '@ezdraft/geometry';
import type { MessageKey } from '../../server/messages/catalog';
import type { ModelStore } from '../model/model-store';
import type { Objects } from '../model/patches';
import { openFloorId } from '../plan/batches';
import type { PlanCanvasHandle } from '../plan/controller';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import type { HoverMode } from '../plan/hover';
import { isTypingTarget, type TypedValues } from '../typed-entry/typed-entry';
import {
  gapBoxes,
  initialRoomRectState,
  initialWallChainState,
  keepGap,
  newObjectId,
  pickWall,
  reducePick,
  reduceRoomRect,
  reduceWallChain,
  snapMarker,
  toModelObjects,
  wallEditChanges,
  wallSnapContext,
  type DrawingToolId,
  type GapBox,
  type PickState,
  type RoomRectState,
  type SnapMarker,
  type ToolContext,
  type ToolInput,
  type WallChainState,
} from './index';

export type DrawingFrame = {
  rect: boolean;
  from: Point | null;
  to: Point | null;
  marker: SnapMarker | null;
  anchor: Point | null;
  referenceDirection: Point | null;
  wallDirection: Point | null;
};

export type DrawingUi = {
  readonly enabled: boolean;
  readonly tool: DrawingToolId | null;
  readonly pick: PickState;
  readonly boxes: readonly GapBox[];
  readonly gapMessage: { readonly wallIds: readonly string[]; readonly key: MessageKey } | null;
  readonly lastLength: number | null;
};

export type ToolKeyEvent = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
  target: unknown;
};

export type DrawingHandle = Pick<
  PlanCanvasHandle,
  | 'getCursor'
  | 'getPixelsPerInch'
  | 'modelToScreen'
  | 'onCameraChange'
  | 'setPointerReceiver'
  | 'setHoverMode'
  | 'getHoveredWallId'
  | 'wallAt'
>;

export type DrawingDeps = {
  handle: DrawingHandle;
  store: ModelStore;
  viewer: { appUserId: string; canEdit: boolean };
  onMessage: (key: MessageKey) => void;
  newId?: () => string;
  now?: () => string;
};

export type DrawingController = {
  getUi(): DrawingUi;
  subscribe(listener: () => void): () => void;
  getFrame(): DrawingFrame | null;
  onFrame(listener: (frame: DrawingFrame | null) => void): () => void;
  selectTool(id: DrawingToolId | null): void;
  typed(values: TypedValues): void;
  keyDown(e: ToolKeyEvent): boolean;
  startPick(wallIds: readonly string[]): void;
  keep(wallIds: readonly string[]): void;
  dispose(): void;
};

export function railMode(o: {
  editor: 'loading' | 'ready' | 'failed' | 'no-access' | 'not-found';
  canEdit: boolean;
  canvasFailed: boolean;
  controllerEnabled: boolean;
}): 'hidden' | 'disabled' | 'enabled' {
  if (o.editor === 'loading') return 'disabled';
  if (o.editor !== 'ready' || !o.canEdit) return 'hidden';
  if (o.canvasFailed || !o.controllerEnabled) return 'disabled';
  return 'enabled';
}

type ToolState = { id: 'wall'; state: WallChainState } | { id: 'room-rect'; state: RoomRectState };

type SnapContext = { anchor: Point | null; referenceDirection: Point | null };

const NO_CONTEXT: SnapContext = { anchor: null, referenceDirection: null };

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

const sameBoxes = (a: readonly GapBox[], b: readonly GapBox[]) =>
  a.length === b.length && JSON.stringify(a) === JSON.stringify(b);

const wallsIn = (models: readonly ModelObject[]): WallObject[] =>
  models.filter((o): o is WallObject => o.type === 'wall');

export function createDrawingController(deps: DrawingDeps): DrawingController {
  const { handle, store, viewer } = deps;
  const newId = deps.newId ?? newObjectId;
  const now = deps.now ?? (() => new Date().toISOString());

  let objects: Objects = store.getState().objects;
  let level: string | null = openFloorId(objects);
  let models: ModelObject[] = level === null ? [] : toModelObjects(objects, level);
  let index: WallSnapIndex = createWallSnapIndex(wallsIn(models));
  const enabled = viewer.canEdit && level !== null;

  let tool: ToolState | null = null;
  let touchPoint: Point | null = null;
  let lastSnap: SnapResult | null = null;
  let lastContext: SnapContext = NO_CONTEXT;
  let hoverMode: HoverMode = 'select';
  let receiverSet = false;
  let disposed = false;
  let drawingIds: readonly string[] = [];

  const uiListeners = new Set<() => void>();
  const frameListeners = new Set<(frame: DrawingFrame | null) => void>();

  const computeBoxes = (): GapBox[] =>
    level === null
      ? []
      : gapBoxes(objects, level, { canEdit: viewer.canEdit, drawingWallIds: drawingIds });

  let ui: DrawingUi = {
    enabled,
    tool: null,
    pick: null,
    boxes: computeBoxes(),
    gapMessage: null,
    lastLength: null,
  };

  const setUi = (patch: Partial<DrawingUi>) => {
    let next: DrawingUi = { ...ui, ...patch };
    const has = (ids: readonly string[]) => next.boxes.some((b) => sameIds(b.wallIds, ids));
    if (next.pick !== null && !has(next.pick.gapWallIds)) next = { ...next, pick: null };
    if (next.gapMessage !== null && !has(next.gapMessage.wallIds))
      next = { ...next, gapMessage: null };
    const changed =
      next.tool !== ui.tool ||
      next.pick !== ui.pick ||
      next.gapMessage !== ui.gapMessage ||
      next.lastLength !== ui.lastLength ||
      !sameBoxes(next.boxes, ui.boxes);
    if (!changed) return;
    if (sameBoxes(next.boxes, ui.boxes)) next = { ...next, boxes: ui.boxes };
    ui = next;
    syncReceiver();
    syncHover();
    for (const l of [...uiListeners]) l();
  };

  const receiver: PlanPointerReceiver = (event) => onPointer(event);

  function syncReceiver(): void {
    if (disposed || !enabled) return;
    const want = ui.tool !== null || ui.pick !== null;
    if (want === receiverSet) return;
    receiverSet = want;
    handle.setPointerReceiver(want ? receiver : null);
  }

  function syncHover(): void {
    const mode: HoverMode = ui.tool !== null ? 'off' : ui.pick !== null ? 'wall' : 'select';
    if (mode === hoverMode) return;
    hoverMode = mode;
    handle.setHoverMode(mode);
  }

  const currentDrawingIds = (): readonly string[] =>
    tool !== null && tool.id === 'wall' ? tool.state.walls.map((w) => w.id) : [];

  function refreshDrawingIds(): void {
    const ids = currentDrawingIds();
    if (sameIds(ids, drawingIds)) return;
    drawingIds = ids;
    setUi({ boxes: computeBoxes() });
  }

  const unsubscribeStore = store.subscribe((state) => {
    if (disposed || state.objects === objects) return;
    const prevLevel = level;
    objects = state.objects;
    level = openFloorId(objects);
    models = level === null ? [] : toModelObjects(objects, level);
    if (level !== prevLevel || level === null) {
      index = createWallSnapIndex(wallsIn(models));
    } else {
      for (const id of state.lastChangedIds) {
        const value = objects.get(id);
        const one = value === undefined ? [] : toModelObjects(new Map([[id, value]]), level);
        const first = one[0];
        if (first !== undefined && first.type === 'wall') index.upsertWall(first);
        else index.removeWall(id);
      }
    }
    drawingIds = currentDrawingIds();
    setUi({ boxes: computeBoxes() });
  });

  function snapContext(): SnapContext {
    if (tool === null || tool.id === 'room-rect') return NO_CONTEXT;
    return wallSnapContext(tool.state);
  }

  function buildFrame(): DrawingFrame | null {
    if (tool === null) return null;
    const marker = lastSnap === null ? null : snapMarker(lastSnap, lastContext);
    const wall = marker?.wallId ? index.getWall(marker.wallId) : undefined;
    const g = wall?.data.geometry;
    const from = tool.id === 'wall' ? wallSnapContext(tool.state).anchor : tool.state.corner;
    return {
      rect: tool.id === 'room-rect',
      from,
      to: lastSnap === null ? null : lastSnap.point,
      marker,
      anchor: lastContext.anchor,
      referenceDirection: lastContext.referenceDirection,
      wallDirection: g ? { x: g.end.x - g.start.x, y: g.end.y - g.start.y } : null,
    };
  }

  let frame: DrawingFrame | null = null;

  function emitFrame(): void {
    frame = buildFrame();
    for (const l of [...frameListeners]) l(frame);
  }

  function finishStep(step: {
    walls: WallObject[];
    message: MessageKey | null;
    exit: boolean;
  }): void {
    if (step.walls.length > 0 && level !== null) {
      const last = step.walls[step.walls.length - 1]!;
      // EZD-294 Build step 15: new walls are numbered from the store's highs.
      store.applyEdit(
        wallEditChanges(
          store.getState().objects,
          level,
          step.walls,
          newId,
          store.getState().numberHighs,
        ),
      );
      setUi({ lastLength: wallLength(last.data.geometry) });
    }
    refreshDrawingIds();
    if (step.message !== null) deps.onMessage(step.message);
    if (step.exit) selectTool(null);
  }

  function input(i: ToolInput): void {
    if (tool === null || level === null) return;
    const ctx: ToolContext = { level, newId, objects: models };
    if (tool.id === 'wall') {
      const step = reduceWallChain(tool.state, i, ctx);
      tool = { id: 'wall', state: step.state };
      finishStep(step);
    } else {
      const step = reduceRoomRect(tool.state, i, ctx);
      tool = { id: 'room-rect', state: step.state };
      finishStep(step);
    }
  }

  function onPick(event: PlanPointerEvent): void {
    const pick = ui.pick;
    if (pick === null || level === null || event.kind !== 'down') return;
    const wall =
      event.pointerType === 'touch' ? handle.wallAt(event.screen) : handle.getHoveredWallId();
    if (wall === null) return;
    const ids = pick.gapWallIds;
    const r = pickWall(store.getState().objects, level, ids, wall, newId);
    if (r.ok) {
      store.applyEdit(r.changes);
      setUi({ pick: reducePick(ui.pick, { type: 'done' }).state });
    } else {
      setUi({ gapMessage: { wallIds: ids, key: r.messageKey } });
    }
  }

  function onPointer(event: PlanPointerEvent): void {
    if (disposed || !enabled || level === null) return;
    if (ui.pick !== null) {
      onPick(event);
      return;
    }
    if (tool === null) return;
    const context = snapContext();
    const result = snap(index, {
      cursor: event.model,
      pixelsPerInch: handle.getPixelsPerInch(),
      anchor: context.anchor,
      referenceDirection: context.referenceDirection,
    });
    lastSnap = result;
    lastContext = context;
    const at = result.point;
    if (event.pointerType === 'touch') {
      if (event.kind === 'down') touchPoint = at;
      else if (event.kind === 'move') input({ type: 'move', at });
      else if (event.kind === 'up' && touchPoint !== null) {
        const pressed = touchPoint;
        touchPoint = null;
        input({ type: 'press', at: pressed });
        input({ type: 'release', at });
      } else if (event.kind === 'cancel') touchPoint = null;
    } else if (event.kind === 'down') input({ type: 'press', at });
    else if (event.kind === 'up') input({ type: 'release', at });
    else if (event.kind === 'move') input({ type: 'move', at });
    else if (event.kind === 'dblclick') input({ type: 'double' });
    emitFrame();
  }

  function selectTool(id: DrawingToolId | null): void {
    if (disposed || !enabled) return;
    if (id === (tool?.id ?? null)) return;
    tool =
      id === null
        ? null
        : id === 'wall'
          ? { id, state: initialWallChainState() }
          : { id, state: initialRoomRectState() };
    touchPoint = null;
    lastSnap = null;
    lastContext = NO_CONTEXT;
    drawingIds = currentDrawingIds();
    setUi({ tool: id, pick: null, gapMessage: null, boxes: computeBoxes() });
    syncHover();
    syncReceiver();
    emitFrame();
  }

  function typed(values: TypedValues): void {
    if (disposed || !enabled || tool === null) return;
    input({ type: 'typed', values });
    emitFrame();
  }

  function keyDown(e: ToolKeyEvent): boolean {
    if (disposed || !enabled) return false;
    if (e.defaultPrevented || isTypingTarget(e.target)) return false;
    if (e.key === 'Escape') {
      if (ui.pick !== null) {
        setUi({ pick: reducePick(ui.pick, { type: 'escape' }).state, gapMessage: null });
        return true;
      }
      if (tool !== null) {
        input({ type: 'escape' });
        emitFrame();
        return true;
      }
      return false;
    }
    if (e.key === 'Enter') {
      if (tool === null) return false;
      input({ type: 'enter' });
      emitFrame();
      return true;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const key = e.key.toLowerCase();
    if (key === 'w') {
      selectTool('wall');
      return true;
    }
    if (key === 'r') {
      selectTool('room-rect');
      return true;
    }
    return false;
  }

  function startPick(wallIds: readonly string[]): void {
    if (disposed || !enabled) return;
    selectTool(null);
    setUi({
      pick: reducePick(ui.pick, { type: 'start', gapWallIds: wallIds }).state,
      gapMessage: null,
    });
    syncHover();
    syncReceiver();
  }

  function keep(wallIds: readonly string[]): void {
    if (disposed || !enabled || level === null) return;
    const r = keepGap(store.getState().objects, level, wallIds, viewer.appUserId, now(), newId);
    if (r.ok) {
      store.applyEdit(r.changes);
      setUi({ gapMessage: null });
    } else {
      setUi({ gapMessage: { wallIds, key: r.messageKey } });
    }
  }

  return {
    getUi: () => ui,
    subscribe(listener) {
      if (disposed) return () => {};
      uiListeners.add(listener);
      return () => void uiListeners.delete(listener);
    },
    getFrame: () => frame,
    onFrame(listener) {
      if (disposed) return () => {};
      frameListeners.add(listener);
      return () => void frameListeners.delete(listener);
    },
    selectTool,
    typed,
    keyDown,
    startPick,
    keep,
    dispose() {
      if (disposed) return;
      disposed = true;
      handle.setPointerReceiver(null);
      unsubscribeStore();
      uiListeners.clear();
      frameListeners.clear();
    },
  };
}

// Drawing controller (EZD-210b; vault/plans/EZD-210b.md section 3 C5-C12, Decided "Enabled", "Caches", "Snap
// index", "Snap call", "Tool context", "Pointer to input", "Apply a step", "Typed", "selectTool(id)", "Keys",
// "Pick", "Keep", "Boxes", "Frame", "Messages", "lastValues", "Rail mode"; Q-0564; Q-0568; Q-0570; Q-0589 (a);
// 11 rule 4). A plain module over the plan canvas handle: it owns the tool state, the snap index and the pointer
// receiver outside React. `getUi()` changes on tool, pick, gap and last-length changes, never per pointer move.
// EZD-208a Build step 6 (vault/plans/EZD-208a.md section 1 R13; Q-0570): the hover mode is 'select' unless a tool
// is on ('off') or a gap pick is on ('wall'), and follows every ui change.
// EZD-219 Build step 11 (vault/plans/EZD-219.md Decided "Every snap call"; AC-EZD-219-1): every snap call takes the
// status bar's snap settings.
// EZD-211b (vault/plans/EZD-211b.md): door and window branch, Space tap, Select seam
import {
  DEFAULT_SNAP_SETTINGS,
  DOOR_TARGET_PX,
  PRESS_MOVE_PX,
  createWallSnapIndex,
  doorTargetAt,
  flipHand,
  flipSwing,
  openingOffsets,
  snap,
  swingSideOf,
  wallLength,
  type DoorSwing,
  type ModelObject,
  type OpeningData,
  type OpeningObject,
  type OpeningOffsets,
  type Point,
  type SnapResult,
  type SnapSettings,
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
import type { SelectionController } from '../selection/selection-controller';
import { isTypingTarget, type TypedValues } from '../typed-entry/typed-entry';
import {
  gapBoxes,
  initialOpeningToolState,
  initialRoomRectState,
  initialWallChainState,
  keepGap,
  newObjectId,
  openingChange,
  openingsOn,
  pickWall,
  reduceOpeningTool,
  reducePick,
  reduceRoomRect,
  reduceWallChain,
  snapMarker,
  toModelObjects,
  wallEditChanges,
  wallSnapContext,
  type DrawingToolId,
  type GapBox,
  type OpeningInput,
  type OpeningStep,
  type OpeningToolState,
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
  opening: OpeningFrame | null;
};

export type OpeningFrame = {
  data: OpeningData;
  host: WallObject;
  offsets: OpeningOffsets | null;
  owned: boolean;
  chipSide: DoorSwing;
  dot: boolean;
  chips: boolean;
};

export type SelectionLink = Pick<SelectionController, 'getUi' | 'select' | 'subscribe'>;

export type DrawingUi = {
  readonly enabled: boolean;
  readonly tool: DrawingToolId | null;
  readonly pick: PickState;
  readonly boxes: readonly GapBox[];
  readonly gapMessage: { readonly wallIds: readonly string[]; readonly key: MessageKey } | null;
  readonly lastLength: number | null;
  readonly doorTarget: 'arc' | 'dot' | null;
  readonly openingWidth: number | null;
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
  snapSettings?: () => Readonly<SnapSettings>;
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
  spaceTap(): boolean;
  attachSelection(link: SelectionLink | null): void;
  claimSelectPointer(event: PlanPointerEvent): boolean;
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

type ToolState =
  | { id: 'wall'; state: WallChainState }
  | { id: 'room-rect'; state: RoomRectState }
  | { id: 'door' | 'window'; state: OpeningToolState };

type OpeningTool = Extract<ToolState, { id: 'door' | 'window' }>;

const isOpeningTool = (t: ToolState | null): t is OpeningTool =>
  t !== null && (t.id === 'door' || t.id === 'window');

type SnapContext = { anchor: Point | null; referenceDirection: Point | null };

const NO_CONTEXT: SnapContext = { anchor: null, referenceDirection: null };

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

const sameBoxes = (a: readonly GapBox[], b: readonly GapBox[]) =>
  a.length === b.length && JSON.stringify(a) === JSON.stringify(b);

const wallsIn = (models: readonly ModelObject[]): WallObject[] =>
  models.filter((o): o is WallObject => o.type === 'wall');

const lower = (id: string) => id.toLowerCase();
const otherSide = (side: DoorSwing | null): DoorSwing => (side === 'left' ? 'right' : 'left');

export function createDrawingController(deps: DrawingDeps): DrawingController {
  const { handle, store, viewer } = deps;
  const newId = deps.newId ?? newObjectId;
  const now = deps.now ?? (() => new Date().toISOString());
  const snapSettings = deps.snapSettings ?? (() => DEFAULT_SNAP_SETTINGS);

  let objects: Objects = store.getState().objects;
  let level: string | null = openFloorId(objects);
  let models: ModelObject[] = level === null ? [] : toModelObjects(objects, level);
  let index: WallSnapIndex = createWallSnapIndex(wallsIn(models));
  let walls: WallObject[] = wallsIn(models);
  let openings: OpeningObject[] = level === null ? [] : openingsOn(objects, level);
  const enabled = viewer.canEdit && level !== null;

  let tool: ToolState | null = null;
  let touchPoint: Point | null = null;
  let lastSnap: SnapResult | null = null;
  let lastContext: SnapContext = NO_CONTEXT;
  let hoverMode: HoverMode = 'select';
  let receiverSet = false;
  let disposed = false;
  let drawingIds: readonly string[] = [];
  let lastPoint: Point | null = null;
  let link: SelectionLink | null = null;
  let unsubscribeLink: (() => void) | null = null;
  let claim: { target: 'arc' | 'dot'; screen: Point; moved: boolean } | null = null;

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
    doorTarget: null,
    openingWidth: null,
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
      next.doorTarget !== ui.doorTarget ||
      next.openingWidth !== ui.openingWidth ||
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
    walls = wallsIn(models);
    openings = level === null ? [] : openingsOn(objects, level);
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
    if (isOpeningTool(tool) || (tool === null && link !== null)) emitFrame();
  });

  function snapContext(): SnapContext {
    if (tool === null || tool.id === 'room-rect') return NO_CONTEXT;
    if (isOpeningTool(tool)) return NO_CONTEXT;
    return wallSnapContext(tool.state);
  }

  const findOpening = (id: string): OpeningObject | null =>
    openings.find((o) => lower(o.id) === lower(id)) ?? null;

  const findWall = (id: string | null): WallObject | null =>
    id === null ? null : (walls.find((w) => lower(w.id) === lower(id)) ?? null);

  // The opening the tool owns, when it is still in the model.
  const ownedOpening = (t: OpeningTool): OpeningObject | null =>
    t.state.owned === null ? null : findOpening(t.state.owned.id);

  // The one selected door under Select (D:Select seam).
  function selectedDoor(): OpeningObject | null {
    if (link === null) return null;
    const ids = link.getUi().ids;
    if (ids.length !== 1) return null;
    const o = findOpening(ids[0]!);
    return o !== null && o.data.attributes.kind === 'door' ? o : null;
  }

  function chipSideOf(data: OpeningData, host: WallObject): DoorSwing {
    if (data.attributes.kind === 'door') return otherSide(data.attributes.swing);
    return lastPoint === null ? 'right' : otherSide(swingSideOf(host, lastPoint));
  }

  function openingFrame(t: OpeningTool): OpeningFrame | null {
    const owned = ownedOpening(t);
    const ownedHost = owned === null ? null : findWall(owned.data.geometry.hostWallId);
    if (owned !== null && ownedHost !== null) {
      return {
        data: owned.data,
        host: ownedHost,
        offsets: openingOffsets(owned, ownedHost, walls),
        owned: true,
        chipSide: chipSideOf(owned.data, ownedHost),
        dot: owned.data.attributes.kind === 'door',
        chips: true,
      };
    }
    const preview = t.state.preview;
    const previewHost = preview === null ? null : findWall(preview.geometry.hostWallId);
    if (preview !== null && previewHost !== null) {
      const wrapped: OpeningObject = { id: '', type: 'opening', data: preview };
      return {
        data: preview,
        host: previewHost,
        offsets: openingOffsets(wrapped, previewHost, walls),
        owned: false,
        chipSide: chipSideOf(preview, previewHost),
        dot: false,
        chips: true,
      };
    }
    return null;
  }

  const EMPTY_FRAME = {
    rect: false,
    from: null,
    to: null,
    marker: null,
    anchor: null,
    referenceDirection: null,
    wallDirection: null,
  } as const;

  function buildFrame(): DrawingFrame | null {
    if (tool === null) {
      const door = selectedDoor();
      const host = door === null ? null : findWall(door.data.geometry.hostWallId);
      if (door === null || host === null) return null;
      return {
        ...EMPTY_FRAME,
        opening: {
          data: door.data,
          host,
          offsets: openingOffsets(door, host, walls),
          owned: true,
          chipSide: chipSideOf(door.data, host),
          dot: true,
          chips: false,
        },
      };
    }
    if (isOpeningTool(tool)) return { ...EMPTY_FRAME, opening: openingFrame(tool) };
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
      opening: null,
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
    } else if (tool.id === 'room-rect') {
      const step = reduceRoomRect(tool.state, i, ctx);
      tool = { id: 'room-rect', state: step.state };
      finishStep(step);
    }
  }

  // D:openingWidth: the preview width, else the owned opening's width, else null.
  function openingWidthNow(): number | null {
    if (!isOpeningTool(tool)) return null;
    if (tool.state.preview !== null) return tool.state.preview.attributes.width;
    return ownedOpening(tool)?.data.attributes.width ?? null;
  }

  // D:Apply step.
  function applyOpeningStep(step: OpeningStep): void {
    if (step.save.length > 0) store.applyEdit(step.save.map(openingChange));
    if (step.select !== null) link?.select([step.select]);
    setUi({ openingWidth: openingWidthNow() });
    if (step.message !== null) deps.onMessage(step.message);
    if (step.exit) selectTool(null);
    emitFrame();
  }

  function openingInput(i: OpeningInput): OpeningStep | null {
    if (!isOpeningTool(tool) || level === null) return null;
    const step = reduceOpeningTool(tool.state, i, {
      newId,
      walls,
      openings,
      highs: store.getState().numberHighs,
      pixelsPerInch: handle.getPixelsPerInch(),
    });
    tool = { id: tool.id, state: step.state };
    applyOpeningStep(step);
    return step;
  }

  function onOpeningPointer(event: PlanPointerEvent): void {
    const kind = event.kind;
    if (kind === 'click' || kind === 'dblclick') return;
    lastPoint = event.model;
    const touch = event.pointerType === 'touch';
    openingInput({
      type: 'pointer',
      kind,
      at: event.model,
      screen: event.screen,
      touch,
      wallId: handle.wallAt(event.screen),
    });
    if (touch) {
      setUi({ doorTarget: null });
    } else if (kind === 'move' && isOpeningTool(tool)) {
      const owned = ownedOpening(tool);
      const target =
        owned === null
          ? null
          : doorTargetAt(
              owned,
              findWall(owned.data.geometry.hostWallId),
              event.model,
              DOOR_TARGET_PX / handle.getPixelsPerInch(),
            );
      setUi({ doorTarget: target });
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
    if (isOpeningTool(tool)) {
      onOpeningPointer(event);
      return;
    }
    const context = snapContext();
    const result = snap(index, {
      cursor: event.model,
      pixelsPerInch: handle.getPixelsPerInch(),
      anchor: context.anchor,
      referenceDirection: context.referenceDirection,
      settings: snapSettings(),
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
          : id === 'room-rect'
            ? { id, state: initialRoomRectState() }
            : { id, state: initialOpeningToolState(id) };
    touchPoint = null;
    lastSnap = null;
    lastContext = NO_CONTEXT;
    lastPoint = null;
    drawingIds = currentDrawingIds();
    setUi({
      tool: id,
      pick: null,
      gapMessage: null,
      boxes: computeBoxes(),
      doorTarget: null,
      openingWidth: openingWidthNow(),
    });
    syncHover();
    syncReceiver();
    emitFrame();
  }

  function typed(values: TypedValues): void {
    if (disposed || !enabled || tool === null) return;
    if (isOpeningTool(tool)) {
      openingInput({ type: 'typed', values, screen: handle.getCursor() });
      return;
    }
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
      if (isOpeningTool(tool)) {
        openingInput({ type: 'escape' });
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
      if (tool === null || isOpeningTool(tool)) return false;
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
    if (key === 'd') {
      selectTool('door');
      return true;
    }
    if (key === 'n') {
      selectTool('window');
      return true;
    }
    return false;
  }

  // D:spaceTap.
  function spaceTap(): boolean {
    if (disposed || !enabled) return false;
    if (isOpeningTool(tool)) {
      const before = tool.state.flipped;
      const step = openingInput({ type: 'space' });
      return step !== null && (step.save.length > 0 || step.state.flipped !== before);
    }
    if (tool !== null) return false;
    const door = selectedDoor();
    if (door === null) return false;
    const flipped = flipSwing(door);
    if (flipped === null) return false;
    store.applyEdit([openingChange(flipped)]);
    emitFrame();
    return true;
  }

  // D:Select seam.
  function attachSelection(next: SelectionLink | null): void {
    unsubscribeLink?.();
    unsubscribeLink = null;
    link = next;
    if (next === null || disposed) return;
    unsubscribeLink = next.subscribe(() => {
      if (disposed) return;
      claim = null;
      setUi({ doorTarget: null });
      if (isOpeningTool(tool) || tool === null) emitFrame();
    });
  }

  function claimSelectPointer(event: PlanPointerEvent): boolean {
    if (disposed || !enabled || tool !== null || ui.pick !== null || link === null) {
      claim = null;
      return false;
    }
    const door = selectedDoor();
    if (door === null) {
      claim = null;
      return false;
    }
    const host = findWall(door.data.geometry.hostWallId);
    const tol = DOOR_TARGET_PX / handle.getPixelsPerInch();
    const touch = event.pointerType === 'touch';
    if (touch) setUi({ doorTarget: null });
    if (claim === null) {
      if (event.kind === 'move' && !touch) {
        setUi({ doorTarget: doorTargetAt(door, host, event.model, tol) });
        return false;
      }
      if (event.kind === 'down') {
        const target = doorTargetAt(door, host, event.model, tol);
        if (target === null) return false;
        claim = { target, screen: { x: event.screen.x, y: event.screen.y }, moved: false };
        return true;
      }
      return false;
    }
    const pressed = claim;
    if (event.kind === 'move') {
      const d = Math.hypot(event.screen.x - pressed.screen.x, event.screen.y - pressed.screen.y);
      if (!pressed.moved && d > PRESS_MOVE_PX) pressed.moved = true;
      return true;
    }
    if (event.kind === 'up') {
      claim = null;
      setUi({ doorTarget: null });
      if (!pressed.moved) {
        const f = pressed.target === 'arc' ? flipSwing(door) : flipHand(door);
        if (f !== null) store.applyEdit([openingChange(f)]);
      }
      return true;
    }
    if (event.kind === 'cancel') {
      claim = null;
      setUi({ doorTarget: null });
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
    spaceTap,
    attachSelection,
    claimSelectPointer,
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

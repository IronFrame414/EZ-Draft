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
// EZD-212b (vault/plans/EZD-212b.md D7): the Move tool branch and every object drag.
// EZD-212c (vault/plans/EZD-212c.md D9-D14): the selection frame, handle presses and drags, typed handle and chip
// entries.
// EZD-234 Build (S03 Fixtures, Validation; 09e:7; Q-0704 05-screens; AC-EZD-234-1, -2, -5): the Fixtures tool (F)
// places the panel's choice at each click; fixtures and utility points move with Move and Select drags; after a move,
// the moved appliances' linked utility points that stayed are listed in `ui.utilities` until the next edit or Close.
// Placing and the list run in `fixturesModule`, loaded when the tool is turned on or a fixture first moves; a click
// before it is there places nothing.
import {
  DEFAULT_SNAP_SETTINGS,
  DOOR_TARGET_PX,
  PRESS_MOVE_PX,
  SNAP_CAPTURE_PX,
  createWallSnapIndex,
  doorTargetAt,
  flipHand,
  flipSwing,
  formatChipDistance,
  openingOffsets,
  snap,
  selectionChips,
  swingSideOf,
  wallChips,
  wallLength,
  type ChipSide,
  type DoorSwing,
  type ModelObject,
  type OpeningData,
  type OpeningObject,
  type OpeningOffsets,
  type PickShape,
  type Point,
  type SnapResult,
  type SnapSettings,
  type WallObject,
  type WallSnapIndex,
  type UtilityToMove,
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
  MOVE_DRAG_PX,
  clickOutcome,
  dragOutcome,
  dragTo,
  gapBoxes,
  gapLastWallId,
  initialMoveToolState,
  moveEditChanges,
  previewShapes,
  reduceMoveTool,
  startMoveDrag,
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
  type MoveDrag,
  type MoveInput,
  type MoveOutcome,
  type MoveToolState,
  type OpeningInput,
  type OpeningStep,
  type OpeningToolState,
  type PickState,
  type RoomRectState,
  type SnapMarker,
  type ToolContext,
  type ToolInput,
  type WallChainState,
  chipEntryOutcome,
  entryValue,
  fixedPoint,
  handleAt,
  hingeHandle,
  resizeByPoint,
  resizeBySize,
  resizeHandles,
  sizeChipNormal,
  type ResizeHandle,
  type ResizeOutcome,
  type SelectionEntry,
  type SelectionFrame,
  looseOn,
  type FixtureChoice,
  type LooseObject,
} from './index';
import { fixturesModule } from './fixtures-module';

export type DrawingFrame = {
  rect: boolean;
  from: Point | null;
  to: Point | null;
  marker: SnapMarker | null;
  anchor: Point | null;
  referenceDirection: Point | null;
  wallDirection: Point | null;
  opening: OpeningFrame | null;
  preview?: readonly PickShape[];
  selection?: SelectionFrame | null;
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

export type SelectionLink = Pick<SelectionController, 'getUi' | 'select' | 'subscribe'> &
  Partial<Pick<SelectionController, 'pickAt'>>;

export type DrawingUi = {
  readonly enabled: boolean;
  readonly tool: DrawingToolId | null;
  readonly pick: PickState;
  readonly boxes: readonly GapBox[];
  readonly gapMessage: { readonly wallIds: readonly string[]; readonly key: MessageKey } | null;
  readonly lastLength: number | null;
  readonly doorTarget: 'arc' | 'dot' | null;
  readonly openingWidth: number | null;
  readonly entry: SelectionEntry | null;
  readonly fixtureChoice: FixtureChoice | null;
  readonly utilities: readonly UtilitiesMoved[] | null;
};

export type UtilitiesMoved = {
  readonly fixtureId: string;
  readonly utilities: readonly UtilityToMove[];
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
  showGap(wallIds: readonly string[]): void;
  spaceTap(): boolean;
  attachSelection(link: SelectionLink | null): void;
  claimSelectPointer(event: PlanPointerEvent): boolean;
  startDrag(ids: readonly string[], press: Point): void;
  dragPointer(event: PlanPointerEvent): void;
  startChipEntry(side: ChipSide): void;
  cancelEntry(): void;
  setFixtureChoice(choice: FixtureChoice): void;
  dismissUtilities(): void;
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
  | { id: 'door' | 'window'; state: OpeningToolState }
  | { id: 'move'; state: MoveToolState }
  | { id: 'fixtures'; state: null };

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
  let loose: LooseObject[] = level === null ? [] : looseOn(objects, level);
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
  // EZD-212c D11: a press under Select on the door's arc or dot, or on a resize handle.
  let claim: {
    screen: Point;
    target: 'arc' | 'dot' | null;
    handle: ResizeHandle | null;
    moved: boolean;
    done: boolean;
    outcome: ResizeOutcome | null;
  } | null = null;
  // EZD-212b D7: the Move press (region px, drag past MOVE_DRAG_PX), the live drag and the cached move models.
  let movePress: { screen: Point; dragged: boolean } | null = null;
  let drag: MoveDrag | null = null;
  let moveCache: ModelObject[] | null = null;
  // EZD-234: a list computed after a later move, placement or Close is dropped.
  let utilitiesSeq = 0;

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
    entry: null,
    fixtureChoice: null,
    utilities: null,
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
      next.entry !== ui.entry ||
      next.fixtureChoice !== ui.fixtureChoice ||
      next.utilities !== ui.utilities ||
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
    const mode: HoverMode =
      ui.tool === 'move'
        ? 'select'
        : ui.tool !== null
          ? 'off'
          : ui.pick !== null
            ? 'wall'
            : 'select';
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
    loose = level === null ? [] : looseOn(objects, level);
    moveCache = null;
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
    if (
      isOpeningTool(tool) ||
      (tool === null && link !== null) ||
      tool?.id === 'move' ||
      drag !== null
    )
      emitFrame();
  });

  // D7 (a): the walls and openings a move reads.
  function moveModels(): ModelObject[] {
    if (moveCache === null) moveCache = [...models, ...openings, ...loose];
    return moveCache;
  }

  function snapContext(): SnapContext {
    if (tool === null || tool.id === 'room-rect' || tool.id === 'move' || tool.id === 'fixtures')
      return NO_CONTEXT;
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

  // D7 (i): the Move tool or Select drag frame.
  function moveFrame(base: Point | null, ids: readonly string[]): DrawingFrame {
    const marker = lastSnap === null ? null : snapMarker(lastSnap, lastContext);
    const wall = marker?.wallId ? index.getWall(marker.wallId) : undefined;
    const g = wall?.data.geometry;
    const to = lastSnap === null ? null : lastSnap.point;
    let outcome: MoveOutcome | null = null;
    if (base !== null && to !== null && level !== null) {
      outcome =
        drag !== null
          ? dragOutcome(drag, { objects: moveModels(), at: to })
          : clickOutcome(moveModels(), ids, { x: to.x - base.x, y: to.y - base.y });
    }
    const result: DrawingFrame = {
      rect: false,
      from: base,
      to,
      marker,
      anchor: base,
      referenceDirection: null,
      wallDirection: g ? { x: g.end.x - g.start.x, y: g.end.y - g.start.y } : null,
      opening: null,
      preview:
        outcome !== null && outcome.ok && level !== null
          ? previewShapes(moveModels(), level, outcome.changed)
          : [],
    };
    // EZD-212c D10: one moved object shows its chips where the move puts it.
    if (ids.length !== 1) return result;
    const id = ids[0]!;
    const after = afterOf(outcome !== null && outcome.ok ? outcome.changed : []);
    const o = after.find((x) => lower(x.id) === lower(id));
    if (o?.type === 'wall') {
      return {
        ...result,
        opening: null,
        selection: { handles: [], active: null, wallChips: wallChips(after, o.id), size: null },
      };
    }
    if (o?.type === 'opening') {
      return { ...result, opening: selectedOpeningFrame(o, after, false), selection: null };
    }
    return result;
  }

  // EZD-212c D10: the move models with an outcome's changed objects swapped in by id.
  function afterOf(changed: readonly ModelObject[]): ModelObject[] {
    const from = moveModels();
    if (changed.length === 0) return from;
    const byId = new Map(changed.map((o) => [lower(o.id), o]));
    return from.map((o) => byId.get(lower(o.id)) ?? o);
  }

  // EZD-212c D9, D10: P211b's opening frame of one selected opening, its host and offsets read from `from`.
  function selectedOpeningFrame(
    o: OpeningObject,
    from: readonly ModelObject[],
    dot: boolean,
  ): OpeningFrame | null {
    const fromWalls = wallsIn(from);
    const hostId = o.data.geometry.hostWallId;
    const host =
      hostId === null ? null : (fromWalls.find((w) => lower(w.id) === lower(hostId)) ?? null);
    if (host === null) return null;
    return {
      data: o.data,
      host,
      offsets: openingOffsets(o, host, fromWalls),
      owned: true,
      chipSide: chipSideOf(o.data, host),
      dot,
      chips: true,
    };
  }

  // EZD-212c D9: one selected wall or opening at rest.
  function restFrame(): DrawingFrame | null {
    if (link === null || level === null) return null;
    const ids = link.getUi().ids;
    if (ids.length !== 1) return null;
    const id = ids[0]!;
    const from = moveModels();
    const o = from.find(
      (x) => (x.type === 'wall' || x.type === 'opening') && lower(x.id) === lower(id),
    );
    if (o === undefined) return null;
    const selection: SelectionFrame = {
      handles: enabled ? resizeHandles(from, ids).map((h) => h.at) : [],
      active: null,
      wallChips: o.type === 'wall' ? wallChips(from, o.id) : [],
      size: null,
    };
    const opening =
      o.type === 'opening'
        ? selectedOpeningFrame(o, from, o.data.attributes.kind === 'door' && enabled)
        : null;
    return { ...EMPTY_FRAME, preview: [], opening, selection };
  }

  // EZD-212c D12: a handle drag.
  function handleFrame(outcome: ResizeOutcome | null, h: ResizeHandle): DrawingFrame {
    const marker = lastSnap === null ? null : snapMarker(lastSnap, lastContext);
    const wall = marker?.wallId ? index.getWall(marker.wallId) : undefined;
    const g = wall?.data.geometry;
    const changed = outcome !== null && outcome.ok ? outcome.changed : null;
    const after = afterOf(changed ?? []);
    let size: SelectionFrame['size'] = null;
    if (h.kind === 'opening' && changed !== null && outcome !== null) {
      const o = changed.find((x) => x.type === 'opening' && lower(x.id) === lower(h.id));
      const normal = sizeChipNormal(after, h.id);
      if (o !== undefined && o.type === 'opening' && normal !== null)
        size = { at: o.data.geometry.center, normal, text: formatChipDistance(outcome.size) };
    }
    const active = h.kind === 'wall' ? (h.end === 'start' ? 0 : 1) : h.jamb === 'lo' ? 0 : 1;
    return {
      rect: false,
      from: null,
      to: null,
      marker,
      anchor: fixedPoint(moveModels(), h),
      referenceDirection: null,
      wallDirection: g ? { x: g.end.x - g.start.x, y: g.end.y - g.start.y } : null,
      preview:
        changed !== null && level !== null ? previewShapes(moveModels(), level, changed) : [],
      opening: null,
      selection: {
        handles: resizeHandles(after, [h.id]).map((x) => x.at),
        active,
        wallChips: h.kind === 'wall' ? wallChips(after, h.id) : [],
        size,
      },
    };
  }

  function buildFrame(): DrawingFrame | null {
    if (tool === null) {
      if (drag !== null) return moveFrame(drag.base, drag.ids);
      if (claim !== null && claim.handle !== null && claim.moved && !claim.done)
        return handleFrame(claim.outcome, claim.handle);
      return restFrame();
    }
    if (tool.id === 'move') return moveFrame(tool.state.base, tool.state.ids);
    if (isOpeningTool(tool)) return { ...EMPTY_FRAME, opening: openingFrame(tool) };
    if (tool.id === 'fixtures')
      return {
        ...EMPTY_FRAME,
        marker: lastSnap === null ? null : snapMarker(lastSnap, NO_CONTEXT),
        opening: null,
      };
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
    const before = drawingIds; // EZD-213c D-Finish
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
    // EZD-213c D-Finish: a chain that ended and left a gap selects the gap's last wall.
    const lastDrawn = before[before.length - 1];
    if (lastDrawn !== undefined && !drawingIds.some((id) => lower(id) === lower(lastDrawn))) {
      const box = ui.boxes.find((b) => b.wallIds.some((id) => lower(id) === lower(lastDrawn)));
      const id = box === undefined ? null : gapLastWallId(box);
      if (id !== null) link?.select([id]);
    }
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
    if (tool.id === 'move') {
      onMovePointer(event, tool.state);
      return;
    }
    if (tool.id === 'fixtures') {
      onFixturePointer(event);
      return;
    }
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

  // EZD-234: a mouse press, or a touch lift, places the panel's choice at the snapped point.
  function onFixturePointer(event: PlanPointerEvent): void {
    if (level === null) return;
    const result = snap(index, {
      cursor: event.model,
      pixelsPerInch: handle.getPixelsPerInch(),
      anchor: null,
      referenceDirection: null,
      settings: snapSettings(),
    });
    lastSnap = result;
    lastContext = NO_CONTEXT;
    const place = event.pointerType === 'touch' ? event.kind === 'up' : event.kind === 'down';
    const mod = fixturesModule.peek();
    if (place && mod !== undefined && ui.fixtureChoice !== null) {
      const change = mod.placeFixture(ui.fixtureChoice, result.point, {
        level,
        objects: loose,
        newId,
      });
      if (change === null) deps.onMessage('office.fixtures.invalid');
      else {
        utilitiesSeq += 1;
        store.applyEdit([change]);
        setUi({ utilities: null });
      }
    }
    emitFrame();
  }

  function setFixtureChoice(choice: FixtureChoice): void {
    if (disposed) return;
    setUi({ fixtureChoice: choice });
  }

  function dismissUtilities(): void {
    if (disposed) return;
    utilitiesSeq += 1;
    setUi({ utilities: null });
  }

  // The panel's starting choice comes with the module.
  function loadFixtures(): void {
    fixturesModule.load().then(
      (m) => {
        if (!disposed && ui.fixtureChoice === null)
          setUi({ fixtureChoice: m.DEFAULT_FIXTURE_CHOICE });
      },
      () => {},
    );
  }

  // D7 (d): snap under Move or a drag; sets the marker's snap and context.
  function moveSnap(cursor: Point, anchor: Point | null, excludeIds: readonly string[]): Point {
    const result = snap(index, {
      cursor,
      pixelsPerInch: handle.getPixelsPerInch(),
      anchor,
      referenceDirection: null,
      excludeIds,
      settings: snapSettings(),
    });
    lastSnap = result;
    lastContext = { anchor, referenceDirection: null };
    return result.point;
  }

  const captureIn = () => SNAP_CAPTURE_PX / handle.getPixelsPerInch();

  // D7 (e): one move as one edit; a refusal is shown.
  function applyMove(outcome: MoveOutcome): void {
    if (level === null) return;
    if (!outcome.ok) {
      deps.onMessage(outcome.message);
      return;
    }
    if (outcome.changed.length === 0) return;
    const before = moveModels();
    const swapped = new Map(outcome.changed.map((o) => [lower(o.id), o]));
    const after = before.map((o) => swapped.get(lower(o.id)) ?? o);
    const fixtureMoved = outcome.changed.some((o) => o.type === 'fixture');
    store.applyEdit(
      moveEditChanges(
        store.getState().objects,
        level,
        outcome.changed,
        newId,
        store.getState().numberHighs,
      ),
    );
    setUi({ utilities: null });
    if (fixtureMoved) {
      const seq = ++utilitiesSeq;
      fixturesModule.load().then(
        (m) => {
          if (disposed || seq !== utilitiesSeq) return;
          const moved = m.utilitiesToMove(before, after);
          setUi({ utilities: moved.length > 0 ? moved : null });
        },
        () => {},
      );
    }
  }

  function finishDrag(d: MoveDrag, at: Point): void {
    if (level === null) return;
    const done = dragTo(d, { objects: moveModels(), level, at, captureIn: captureIn() });
    drag = null;
    applyMove(dragOutcome(done, { objects: moveModels(), at }));
  }

  // D7 (e): apply a Move step.
  function moveInput(i: MoveInput, at: Point | null = null): void {
    if (tool === null || tool.id !== 'move') return;
    const step = reduceMoveTool(tool.state, i);
    tool = { id: 'move', state: step.state };
    if (step.select !== null) link?.select(step.select);
    if (step.commit !== null) {
      const c = step.commit;
      const d = drag;
      if (c.drag && d !== null && at !== null) finishDrag(d, at);
      else {
        drag = null;
        applyMove(clickOutcome(moveModels(), c.ids, c.delta));
      }
    }
    if (i.type === 'escape' || i.type === 'cancel') drag = null;
    if (step.message !== null) deps.onMessage(step.message);
    if (step.exit) selectTool(null);
    emitFrame();
  }

  function onMovePointer(event: PlanPointerEvent, state: MoveToolState): void {
    const kind = event.kind;
    if (kind === 'click' || kind === 'dblclick') return;
    const at = moveSnap(event.model, state.base, state.base === null ? [] : state.ids);
    if (kind === 'down') {
      movePress = { screen: { x: event.screen.x, y: event.screen.y }, dragged: false };
      moveInput({
        type: 'press',
        at,
        selected: link?.getUi().ids ?? [],
        picked: link?.pickAt?.(event.model) ?? [],
      });
    } else if (kind === 'move') {
      let started = false;
      if (movePress !== null && !movePress.dragged) {
        const d = Math.hypot(
          event.screen.x - movePress.screen.x,
          event.screen.y - movePress.screen.y,
        );
        if (d > MOVE_DRAG_PX) {
          movePress.dragged = true;
          started = true;
        }
      }
      const held = state.held === 'select' || state.held === 'base';
      if (held && state.base !== null && level !== null) {
        if (started) drag = startMoveDrag(moveModels(), state.ids, state.base);
        else if (drag !== null)
          drag = dragTo(drag, { objects: moveModels(), level, at, captureIn: captureIn() });
      }
      moveInput({ type: 'move', at });
    } else if (kind === 'up') {
      const dragged = movePress?.dragged ?? false;
      movePress = null;
      moveInput({ type: 'release', at, dragged }, at);
    } else if (kind === 'cancel') {
      movePress = null;
      moveInput({ type: 'cancel' });
    }
  }

  // D7 (h): a Select drag handed over by the selection controller.
  function startDrag(ids: readonly string[], press: Point): void {
    if (disposed || !enabled || level === null || tool !== null || ids.length === 0) return;
    const base = moveSnap(press, null, []);
    drag = startMoveDrag(moveModels(), ids, base);
    emitFrame();
  }

  function dragPointer(event: PlanPointerEvent): void {
    if (disposed || drag === null || level === null) return;
    const d = drag;
    const at = moveSnap(event.model, d.base, d.ids);
    if (event.kind === 'move') {
      drag = dragTo(d, { objects: moveModels(), level, at, captureIn: captureIn() });
    } else if (event.kind === 'up') {
      finishDrag(d, at);
      lastSnap = null;
      lastContext = NO_CONTEXT;
    } else if (event.kind === 'cancel') {
      drag = null;
      lastSnap = null;
      lastContext = NO_CONTEXT;
    }
    emitFrame();
  }

  function selectTool(id: DrawingToolId | null): void {
    if (disposed || !enabled) return;
    cancelEntry();
    const hadDrag = drag !== null;
    drag = null;
    movePress = null;
    if (id === (tool?.id ?? null)) {
      if (hadDrag) {
        lastSnap = null;
        lastContext = NO_CONTEXT;
        emitFrame();
      }
      return;
    }
    tool =
      id === null
        ? null
        : id === 'wall'
          ? { id, state: initialWallChainState() }
          : id === 'room-rect'
            ? { id, state: initialRoomRectState() }
            : id === 'move'
              ? { id, state: initialMoveToolState() }
              : id === 'fixtures'
                ? { id, state: null }
                : { id, state: initialOpeningToolState(id) };
    if (id === 'fixtures') loadFixtures();
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
    if (disposed || !enabled) return;
    if (tool === null) {
      typedEntry(values);
      return;
    }
    if (tool.id === 'move') {
      moveInput({ type: 'typed', distance: values.distance ?? null });
      return;
    }
    if (isOpeningTool(tool)) {
      openingInput({ type: 'typed', values, screen: handle.getCursor() });
      return;
    }
    input({ type: 'typed', values });
    emitFrame();
  }

  // EZD-212c D13: a size typed during a handle drag, or a chip's typed distance.
  function typedEntry(values: TypedValues): void {
    const entry = ui.entry;
    if (entry === null) return;
    const v = entryValue(entry, values);
    if (entry.kind === 'handle') {
      const c = claim;
      if (v === null || c === null || c.handle === null) return;
      const r = resizeBySize(moveModels(), c.handle, v);
      c.done = true;
      setUi({ entry: null });
      applyMove(r);
      emitFrame();
      return;
    }
    const r = chipEntryOutcome(moveModels(), entry, v);
    setUi({ entry: null });
    if (r !== null) applyMove(r);
    emitFrame();
  }

  function startChipEntry(side: ChipSide): void {
    if (disposed || !enabled || tool !== null || ui.pick !== null || claim !== null) return;
    if (link === null) return;
    const ids = link.getUi().ids;
    if (ids.length !== 1) return;
    const from = moveModels();
    if (!selectionChips(from, ids).some((c) => c.side === side)) return;
    const o = from.find((x) => lower(x.id) === lower(ids[0]!));
    if (o === undefined) return;
    const objectKind =
      o.type === 'wall' ? 'wall' : o.type === 'opening' ? o.data.attributes.kind : null;
    if (objectKind === null) return;
    setUi({ entry: { kind: 'chip', id: o.id, objectKind, side } });
  }

  function cancelEntry(): void {
    if (disposed) return;
    claim = null;
    setUi({ entry: null });
    emitFrame();
  }

  function keyDown(e: ToolKeyEvent): boolean {
    if (disposed || !enabled) return false;
    if (e.defaultPrevented || isTypingTarget(e.target)) return false;
    if (e.key === 'Escape' && (ui.entry !== null || claim !== null)) {
      cancelEntry();
      return true;
    }
    if (e.key === 'Escape') {
      if (ui.pick !== null) {
        setUi({ pick: reducePick(ui.pick, { type: 'escape' }).state, gapMessage: null });
        return true;
      }
      if (isOpeningTool(tool)) {
        openingInput({ type: 'escape' });
        return true;
      }
      if (tool !== null && tool.id === 'move') {
        moveInput({ type: 'escape' });
        return true;
      }
      if (tool !== null && tool.id === 'fixtures') {
        selectTool(null);
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
      if (tool === null || isOpeningTool(tool) || tool.id === 'move' || tool.id === 'fixtures')
        return false;
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
    if (key === 'm') {
      selectTool('move');
      return true;
    }
    if (key === 'f') {
      selectTool('fixtures');
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
      // EZD-212c D14: an entry ends when the selection is no longer its one object, and a handle entry always.
      const entry = ui.entry;
      if (entry !== null) {
        const ids = next.getUi().ids;
        const same = ids.length === 1 && lower(ids[0]!) === lower(entry.id);
        if (!same || entry.kind === 'handle') cancelEntry();
      }
      if (isOpeningTool(tool) || tool === null) emitFrame();
    });
  }

  function claimSelectPointer(event: PlanPointerEvent): boolean {
    if (disposed || !enabled || tool !== null || ui.pick !== null || link === null) {
      claim = null;
      return false;
    }
    // D11: one selected wall or opening.
    const ids = link.getUi().ids;
    const from = moveModels();
    const one =
      ids.length === 1
        ? from.find(
            (x) => (x.type === 'wall' || x.type === 'opening') && lower(x.id) === lower(ids[0]!),
          )
        : undefined;
    if (one === undefined) {
      claim = null;
      return false;
    }
    const door = selectedDoor();
    const host = door === null ? null : findWall(door.data.geometry.hostWallId);
    const tol = DOOR_TARGET_PX / handle.getPixelsPerInch();
    const touch = event.pointerType === 'touch';
    if (touch) setUi({ doorTarget: null });
    if (claim === null) {
      if (event.kind === 'move' && !touch) {
        if (door !== null) setUi({ doorTarget: doorTargetAt(door, host, event.model, tol) });
        return false;
      }
      if (event.kind === 'down') {
        const screen = { x: event.screen.x, y: event.screen.y };
        const t = door === null ? null : doorTargetAt(door, host, event.model, tol);
        const press = { screen, moved: false, done: false, outcome: null };
        if (t === 'dot' && door !== null) {
          claim = { ...press, target: 'dot', handle: hingeHandle(from, door.id) };
          return true;
        }
        const h = handleAt(resizeHandles(from, ids), event.screen, handle.modelToScreen);
        if (h !== null) {
          claim = { ...press, target: t, handle: h };
          return true;
        }
        if (t === 'arc') {
          claim = { ...press, target: 'arc', handle: null };
          return true;
        }
        return false;
      }
      return false;
    }
    const pressed = claim;
    if (event.kind === 'move') {
      if (pressed.done) return true;
      const d = Math.hypot(event.screen.x - pressed.screen.x, event.screen.y - pressed.screen.y);
      const h = pressed.handle;
      if (!pressed.moved && d > PRESS_MOVE_PX) {
        pressed.moved = true;
        if (h !== null) {
          const objectKind =
            one.type === 'wall' ? 'wall' : one.type === 'opening' ? one.data.attributes.kind : null;
          if (objectKind !== null) setUi({ entry: { kind: 'handle', id: h.id, objectKind } });
        }
      }
      if (pressed.moved && h !== null) {
        const fixed = fixedPoint(from, h);
        const exclude =
          h.kind === 'wall'
            ? [h.id]
            : one.type === 'opening' && one.data.geometry.hostWallId !== null
              ? [one.data.geometry.hostWallId]
              : [];
        const p = moveSnap(event.model, fixed, exclude);
        pressed.outcome = resizeByPoint(from, h, p);
        emitFrame();
      }
      return true;
    }
    if (event.kind === 'up') {
      claim = null;
      setUi({ doorTarget: null, entry: null });
      if (!pressed.moved) {
        if (door !== null && pressed.target !== null) {
          const f = pressed.target === 'arc' ? flipSwing(door) : flipHand(door);
          if (f !== null) store.applyEdit([openingChange(f)]);
        }
      } else if (!pressed.done && pressed.handle !== null && pressed.outcome !== null) {
        applyMove(pressed.outcome);
      }
      lastSnap = null;
      lastContext = NO_CONTEXT;
      emitFrame();
      return true;
    }
    if (event.kind === 'cancel') {
      claim = null;
      setUi({ doorTarget: null, entry: null });
      lastSnap = null;
      lastContext = NO_CONTEXT;
      emitFrame();
      return true;
    }
    return true;
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

  // EZD-213c D-Show: selects the gap's last wall so the inspector shows the section; no `enabled` check (view-only too).
  function showGap(wallIds: readonly string[]): void {
    if (disposed) return;
    const last = wallIds[wallIds.length - 1];
    if (last !== undefined) link?.select([last]);
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
    showGap,
    spaceTap,
    attachSelection,
    claimSelectPointer,
    startDrag,
    dragPointer,
    startChipEntry,
    cancelEntry,
    setFixtureChoice,
    dismissUtilities,
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

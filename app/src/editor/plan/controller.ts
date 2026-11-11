// EZD-207a Build step 9 (vault/plans/EZD-207a.md section 3 C1, C4; Decided "View changes", "First view", "Start
// failure", "Model changes", "Camera"; 11 rules 1, 4; Q-0214): the plan canvas without React. It owns the view,
// the scene and the input, rebuilds batches only when the model's objects change, and draws only on demand.
// EZD-207b Build step 8 (vault/plans/EZD-207b.md Decided "Zoom step", "Controller hover", "Hover triggers",
// "wallAt", "showObject", "Atlas in controller", "Stats"; C1, C7, C8, C13): step zoom, wall hover through the
// hover index, Show for one object, and the drawing list's text once the glyph atlas is made.
// EZD-208a Build step 5 (vault/plans/EZD-208a.md section 3 A6-A7; section 1 R10-R12): the select hover mode with
// its picker, the body lookup, and the selection drawn and redrawn on change.
// EZD-219 Build step 9 (vault/plans/EZD-219.md Decided "Scale change", "Typed zoom apply", "Controller"): the plan
// scale sets what 100% zoom means; typed zoom; the cursor's model point for the status bar.
// EZD-211b Build step 6 (vault/plans/EZD-211b.md Decided "Space tap"): `onSpaceTap` listeners.
// EZD-376 Build step 5 (vault/plans/EZD-376.md; Q-0692): a failed atlas also turns `atlasFailed()` on and tells its listeners once.
// EZD-235 Build step 8 (vault/plans/EZD-235.md Decided "D-Plan"; 11 rule 2): room areas through the model's derived values.
import type { DerivedStats, DrawingList, Point } from '@ezdraft/geometry';
import { DEFAULT_PLAN_SCALE, isPlanScale, type PlanScale } from '../../lib/plan/plan-scale';
import { createModelDerived, type ModelDerived } from '../derived/model-derived';
import type { ModelStore } from '../model/model-store';
import { buildPlanBatches, drawingBounds, openFloorId, planDrawingList } from './batches';
import { layoutText } from './glyph-atlas';
import {
  HOVER_CAPTURE_PX,
  createHoverIndex,
  objectGeometry,
  pickWall,
  type BodyLookup,
  type HoverMode,
  type HoverPicker,
  type ObjectGeometry,
} from './hover';
import {
  createPlanInput,
  type InputSurface,
  type PlanInput,
  type PlanPointerReceiver,
} from './input';
import { createPlanScene, type PlanScene } from './scene';
import {
  MAX_ZOOM_PERCENT,
  MIN_ZOOM_PERCENT,
  cameraFrame,
  clampPpi,
  fitView,
  gridStepIn,
  modelToRegion,
  regionToModel,
  zoom100Ppi,
  zoomAt,
  zoomPercent,
  type Bounds,
  type CameraFrame,
  type PlanView,
  type Size,
} from './view';

export type PlanStats = {
  frames: number;
  drawCalls: number;
  bufferUploads: number;
  glyphs: number;
  highlightUploads: number;
  selectionUploads: number;
};
export const ZOOM_STEP_FACTOR = 1.25;
export type RenderRoot = {
  start(size: Size): Promise<void>;
  resize(size: Size): void;
  setCamera(frame: CameraFrame): void;
  invalidate(): void;
  stats(): { frames: number; drawCalls: number };
  unmount(): void;
};
export type CreateRenderRoot = (canvas: HTMLCanvasElement, scene: PlanScene) => RenderRoot;
export type ClientRect = { left: number; top: number; width: number; height: number };

export type PlanCanvasHandle = {
  getCursor(): Point | null;
  getPixelsPerInch(): number;
  getView(): PlanView;
  setView(view: PlanView): void;
  fit(): void;
  modelToScreen(p: Point): Point;
  screenToModel(p: Point): Point;
  getViewCenter(): Point | null;
  onCameraChange(listener: (view: PlanView) => void): () => void;
  setPointerReceiver(receiver: PlanPointerReceiver | null): void;
  zoomIn(): void;
  zoomOut(): void;
  showObject(id: string): boolean;
  setHoverMode(mode: HoverMode): void;
  getHoveredWallId(): string | null;
  wallAt(screen: Point): string | null;
  setHoverPicker(picker: HoverPicker | null): void;
  setBodyLookup(lookup: BodyLookup | null): void;
  setSelectedIds(ids: readonly string[]): void;
  getHoveredId(): string | null;
  getScale(): PlanScale;
  setScale(scale: PlanScale): void;
  getZoomPercent(): number;
  setZoomPercent(percent: number): void;
  onCursorChange(listener: (model: Point | null) => void): () => void;
  onSpaceTap(listener: () => void): () => void;
};

export type PlanController = {
  handle: PlanCanvasHandle;
  attachCanvas(canvas: HTMLCanvasElement): Promise<'ready' | 'failed' | 'detached'>;
  detachCanvas(): void;
  attachSurface(surface: InputSurface | null): void;
  setCanvasRect(rect: ClientRect): void;
  setRegionRect(rect: ClientRect): void;
  stats(): PlanStats;
  derivedStats(): DerivedStats;
  atlasFailed(): boolean;
  subscribeAtlasFailed(listener: () => void): () => void;
  dispose(): void;
};

async function reportDefault(error: unknown): Promise<void> {
  const { captureBrowserError } = await import('../../lib/errors/capture');
  captureBrowserError(error, 'plan.canvas_start');
}

function unmountQuietly(root: RenderRoot): void {
  try {
    root.unmount();
  } catch {
    // The root is dropped either way.
  }
}

export function createPlanController(
  o: {
    store: Pick<ModelStore, 'getState' | 'subscribe'>;
    scale?: PlanScale;
    derived?: ModelDerived;
  },
  deps: {
    createRoot: CreateRenderRoot;
    keys?: EventTarget;
    report?: (error: unknown) => void;
    createAtlas?: () => Promise<HTMLCanvasElement>;
  },
): PlanController {
  const report = deps.report ?? ((error: unknown) => void reportDefault(error));
  const scene = createPlanScene();
  const derived = o.derived ?? createModelDerived(o.store);
  let scale: PlanScale = o.scale ?? DEFAULT_PLAN_SCALE;
  const zoom100 = () => zoom100Ppi(scale);
  let view: PlanView = { x: 0, y: 0, ppi: zoom100() };
  let bounds: Bounds | null = null;
  let bufferUploads = 0;
  let canvasRect: ClientRect | null = null;
  let regionRect: ClientRect | null = null;
  let fitted = false;
  let root: RenderRoot | null = null;
  let ready = false;
  let attachToken = 0;
  let input: PlanInput | null = null;
  let receiver: PlanPointerReceiver | null = null;
  const listeners: Array<{ fn: (view: PlanView) => void }> = [];
  const cursorListeners: Array<{ fn: (model: Point | null) => void }> = [];
  const spaceTapListeners: Array<{ fn: () => void }> = [];
  let cursorScreen: Point | null = null;
  let list: DrawingList | null = null;
  let disposed = false;
  let atlasRequested = false;
  let atlasSet = false;
  let textFailed = false;
  const atlasFailedListeners: Array<{ fn: () => void }> = [];
  let glyphs = 0;
  let highlightUploads = 0;
  let mode: HoverMode = 'wall';
  let hoverScreen: Point | null = null;
  let hoveredId: string | null = null;
  let hoveredFromWall = false;
  let picker: HoverPicker | null = null;
  let bodyLookup: BodyLookup | null = null;
  let selectedIds: ReadonlySet<string> = new Set();
  let selectionUploads = 0;
  const hover = createHoverIndex();
  const NO_HIGHLIGHT = new Float32Array(0);

  const joined = (g: ObjectGeometry): Float32Array => {
    const out = new Float32Array(g.fill.length + g.body.length);
    out.set(g.fill, 0);
    out.set(g.body, g.fill.length);
    return out;
  };

  // The selection step: true when the selection drawing was created, replaced or removed, so a redraw is due.
  const selectionStep = (): boolean => {
    const uploaded = scene.setSelection(objectGeometry(list, selectedIds, bodyLookup));
    selectionUploads += uploaded;
    return uploaded > 0;
  };

  const rebuild = (): number => {
    list = planDrawingList(o.store.getState().objects, { roomAreaSqFt: derived.roomAreaSqFt });
    derived.prune();
    bounds = drawingBounds(list);
    const before = scene.objectCount();
    const uploaded = scene.setBatches(buildPlanBatches(list));
    bufferUploads += uploaded;
    return uploaded > 0 || scene.objectCount() !== before ? 1 : 0;
  };
  hover.sync(o.store.getState().objects, openFloorId(o.store.getState().objects), []);
  rebuild();

  const tolerance = () => HOVER_CAPTURE_PX / view.ppi;

  const updateHover = (force: boolean): boolean => {
    let id: string | null = null;
    let fromWall = false;
    if (mode !== 'off' && hoverScreen !== null) {
      if (mode === 'select' && picker !== null) {
        id = picker(hoverScreen);
      } else {
        id = pickWall(hover.index, regionToModel(view, hoverScreen), tolerance());
        fromWall = true;
      }
    }
    hoveredFromWall = fromWall;
    if (id === hoveredId && !force) return false;
    const changed = id !== hoveredId;
    hoveredId = id;
    let uploaded: number;
    if (id === null) {
      uploaded = scene.setHighlight(NO_HIGHLIGHT);
    } else {
      const g = objectGeometry(list, new Set([id.toLowerCase()]), bodyLookup);
      uploaded = scene.setHighlight(joined(g), g.segments);
    }
    highlightUploads += uploaded;
    return changed || uploaded > 0;
  };

  // The text step: true when the text mesh was uploaded or removed, so a redraw is due.
  const textStep = (): boolean => {
    const batch = layoutText(list);
    const u = scene.setText(batch);
    bufferUploads += u;
    const removed = glyphs > 0 && batch.glyphs === 0;
    glyphs = batch.glyphs;
    return u === 1 || removed;
  };

  const regionSize = (): Size | null =>
    regionRect !== null && regionRect.width > 0 && regionRect.height > 0
      ? { width: regionRect.width, height: regionRect.height }
      : null;

  const updateCamera = () => {
    if (root === null || !ready || canvasRect === null || regionRect === null) return;
    const offset = { x: regionRect.left - canvasRect.left, y: regionRect.top - canvasRect.top };
    root.setCamera(
      cameraFrame(view, { width: canvasRect.width, height: canvasRect.height }, offset),
    );
    const origin = regionToModel(view, { x: -offset.x, y: -offset.y });
    scene.setGrid({
      originX: origin.x,
      originY: origin.y,
      ppi: view.ppi,
      stepIn: gridStepIn(view.ppi),
    });
  };

  const redraw = () => {
    if (root !== null && ready) root.invalidate();
  };

  const setView = (next: PlanView) => {
    if (!Number.isFinite(next.x) || !Number.isFinite(next.y) || !Number.isFinite(next.ppi)) return;
    const ppi = clampPpi(next.ppi, zoom100());
    if (next.x === view.x && next.y === view.y && ppi === view.ppi) return;
    view = { x: next.x, y: next.y, ppi };
    updateCamera();
    updateHover(false);
    redraw();
    for (const l of [...listeners]) l.fn({ ...view });
    if (cursorScreen !== null) emitCursor();
  };

  const emitCursor = () => {
    const model = cursorScreen === null ? null : regionToModel(view, cursorScreen);
    for (const l of [...cursorListeners]) l.fn(model === null ? null : { ...model });
  };

  // The view at `ppi` with the model point under the region centre kept; null without a region size.
  const aboutCentre = (ppi: number): PlanView | null => {
    const size = regionSize();
    if (size === null) return null;
    const c = { x: size.width / 2, y: size.height / 2 };
    const anchor = regionToModel(view, c);
    return { x: anchor.x - c.x / ppi, y: anchor.y + c.y / ppi, ppi };
  };

  const unsubscribe = o.store.subscribe((state, prev) => {
    if (state.objects === prev.objects) return;
    hover.sync(state.objects, openFloorId(state.objects), state.lastChangedIds);
    const rebuilt = rebuild() > 0;
    const selected = selectedIds.size > 0 ? selectionStep() : false;
    const texted = atlasSet ? textStep() : false;
    const hovered = hoveredId !== null ? hoveredId.toLowerCase() : null;
    const force =
      hovered !== null && state.lastChangedIds.some((id) => id.toLowerCase() === hovered);
    const hoverChanged = updateHover(force);
    if (rebuilt || selected || texted || hoverChanged) redraw();
  });

  const zoomBy = (factor: number) => {
    const size = regionSize();
    if (size === null) return;
    if (clampPpi(view.ppi * factor, zoom100()) === view.ppi) return;
    setView(zoomAt(view, { x: size.width / 2, y: size.height / 2 }, factor, zoom100()));
  };

  const handle: PlanCanvasHandle = {
    getCursor: () => input?.getCursor() ?? null,
    getPixelsPerInch: () => view.ppi,
    getView: () => ({ ...view }),
    setView,
    fit() {
      const size = regionSize();
      if (size !== null) setView(fitView(bounds, size, zoom100()));
    },
    modelToScreen: (p) => modelToRegion(view, p),
    screenToModel: (p) => regionToModel(view, p),
    // EZD-217 Build step 5 (Decided "getViewCenter"): the model point at the region centre.
    getViewCenter() {
      const size = regionSize();
      return size === null ? null : regionToModel(view, { x: size.width / 2, y: size.height / 2 });
    },
    onCameraChange(fn) {
      const entry = { fn };
      listeners.push(entry);
      return () => {
        const i = listeners.indexOf(entry);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    onSpaceTap(fn) {
      const entry = { fn };
      spaceTapListeners.push(entry);
      return () => {
        const i = spaceTapListeners.indexOf(entry);
        if (i >= 0) spaceTapListeners.splice(i, 1);
      };
    },
    setPointerReceiver(next) {
      receiver = next;
    },
    zoomIn: () => zoomBy(ZOOM_STEP_FACTOR),
    zoomOut: () => zoomBy(1 / ZOOM_STEP_FACTOR),
    showObject(id) {
      if (list === null) return false;
      const want = id.toLowerCase();
      const objectBounds = drawingBounds({
        ...list,
        items: list.items.filter((i) => i.objectId.toLowerCase() === want),
      });
      const size = regionSize();
      if (objectBounds === null || size === null) return false;
      setView(fitView(objectBounds, size, zoom100()));
      return true;
    },
    setHoverMode(next) {
      if ((next !== 'wall' && next !== 'select' && next !== 'off') || next === mode) return;
      mode = next;
      if (updateHover(false)) redraw();
    },
    getHoveredWallId: () => (hoveredFromWall ? hoveredId : null),
    wallAt(screen) {
      if (!Number.isFinite(screen.x) || !Number.isFinite(screen.y)) return null;
      return pickWall(hover.index, regionToModel(view, screen), tolerance());
    },
    setHoverPicker(next) {
      picker = next;
      if (updateHover(false)) redraw();
    },
    setBodyLookup(next) {
      bodyLookup = next;
      const selected = selectionStep();
      const hoverChanged = updateHover(true);
      if (selected || hoverChanged) redraw();
    },
    setSelectedIds(ids) {
      selectedIds = new Set(ids.map((id) => id.toLowerCase()));
      const selected = selectionStep();
      const hoverChanged = updateHover(true);
      if (selected || hoverChanged) redraw();
    },
    getHoveredId: () => hoveredId,
    getScale: () => scale,
    setScale(next) {
      if (!isPlanScale(next) || next === scale) return;
      const ppi = (view.ppi / zoom100()) * zoom100Ppi(next);
      scale = next;
      setView(aboutCentre(ppi) ?? { x: view.x, y: view.y, ppi });
    },
    getZoomPercent: () => zoomPercent(view.ppi, zoom100()),
    setZoomPercent(percent) {
      if (!Number.isFinite(percent)) return;
      const p = Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, percent));
      const ppi = clampPpi((zoom100() * p) / 100, zoom100());
      if (ppi === view.ppi) return;
      const next = aboutCentre(ppi);
      if (next !== null) setView(next);
    },
    onCursorChange(fn) {
      const entry = { fn };
      cursorListeners.push(entry);
      return () => {
        const i = cursorListeners.indexOf(entry);
        if (i >= 0) cursorListeners.splice(i, 1);
      };
    },
  };

  const requestAtlas = (createAtlas: () => Promise<HTMLCanvasElement>) => {
    atlasRequested = true;
    createAtlas().then(
      (canvas) => {
        if (disposed) return;
        scene.setAtlas(canvas);
        atlasSet = true;
        if (textStep()) redraw();
      },
      (error: unknown) => {
        report(new Error('plan.glyph_atlas', { cause: error }));
        if (disposed) return;
        textFailed = true;
        for (const l of [...atlasFailedListeners]) l.fn();
      },
    );
  };

  const detachCanvas = () => {
    attachToken += 1;
    if (root !== null && ready) unmountQuietly(root);
    if (ready) root = null;
    ready = false;
  };

  return {
    handle,
    async attachCanvas(canvas) {
      detachCanvas();
      const token = attachToken;
      const created = deps.createRoot(canvas, scene);
      root = created;
      const size = canvasRect
        ? { width: canvasRect.width, height: canvasRect.height }
        : { width: 0, height: 0 };
      try {
        await created.start(size);
      } catch (error) {
        unmountQuietly(created);
        if (root === created) root = null;
        if (token !== attachToken) return 'detached';
        report(error);
        return 'failed';
      }
      if (token !== attachToken) {
        unmountQuietly(created);
        if (root === created) root = null;
        return 'detached';
      }
      ready = true;
      // A size that changed while start was pending reaches the renderer now.
      if (
        canvasRect !== null &&
        (canvasRect.width !== size.width || canvasRect.height !== size.height)
      ) {
        created.resize({ width: canvasRect.width, height: canvasRect.height });
      }
      updateCamera();
      redraw();
      if (!atlasRequested && deps.createAtlas !== undefined) requestAtlas(deps.createAtlas);
      return 'ready';
    },
    detachCanvas,
    attachSurface(surface) {
      input?.dispose();
      input = null;
      if (surface === null) return;
      input = createPlanInput({
        surface,
        keys: deps.keys ?? window,
        getView: () => view,
        setView,
        getReceiver: () => receiver,
        onHover(screen) {
          hoverScreen = screen;
          if (updateHover(false)) redraw();
        },
        getZoom100: zoom100,
        onCursor(screen) {
          cursorScreen = screen;
          emitCursor();
        },
        onSpaceTap() {
          for (const l of [...spaceTapListeners]) l.fn();
        },
      });
    },
    setCanvasRect(rect) {
      const resized =
        canvasRect === null || canvasRect.width !== rect.width || canvasRect.height !== rect.height;
      canvasRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      if (root === null || !ready) return;
      if (resized) root.resize({ width: rect.width, height: rect.height });
      updateCamera();
      redraw();
    },
    setRegionRect(rect) {
      regionRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      const size = regionSize();
      if (!fitted && size !== null) {
        fitted = true;
        setView(fitView(bounds, size, zoom100()));
        return;
      }
      updateCamera();
      redraw();
    },
    atlasFailed: () => textFailed,
    subscribeAtlasFailed(fn) {
      const entry = { fn };
      atlasFailedListeners.push(entry);
      return () => {
        const i = atlasFailedListeners.indexOf(entry);
        if (i >= 0) atlasFailedListeners.splice(i, 1);
      };
    },
    derivedStats: () => derived.stats(),
    stats() {
      const s = root !== null && ready ? root.stats() : { frames: 0, drawCalls: 0 };
      return {
        frames: s.frames,
        drawCalls: s.drawCalls,
        bufferUploads,
        glyphs,
        highlightUploads,
        selectionUploads,
      };
    },
    dispose() {
      disposed = true;
      unsubscribe();
      input?.dispose();
      input = null;
      detachCanvas();
      listeners.length = 0;
      cursorListeners.length = 0;
      atlasFailedListeners.length = 0;
      spaceTapListeners.length = 0;
      scene.dispose();
    },
  };
}

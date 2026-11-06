// EZD-207a Build step 9 (vault/plans/EZD-207a.md section 3 C1, C4; Decided "View changes", "First view", "Start
// failure", "Model changes", "Camera"; 11 rules 1, 4; Q-0214): the plan canvas without React. It owns the view,
// the scene and the input, rebuilds batches only when the model's objects change, and draws only on demand.
import type { Point } from '@ezdraft/geometry';
import type { ModelStore } from '../model/model-store';
import { buildPlanBatches, drawingBounds, planDrawingList } from './batches';
import {
  createPlanInput,
  type InputSurface,
  type PlanInput,
  type PlanPointerReceiver,
} from './input';
import { createPlanScene, type PlanScene } from './scene';
import {
  ZOOM_100_PPI,
  cameraFrame,
  clampPpi,
  fitView,
  gridStepIn,
  modelToRegion,
  regionToModel,
  type Bounds,
  type CameraFrame,
  type PlanView,
  type Size,
} from './view';

export type PlanStats = { frames: number; drawCalls: number; bufferUploads: number };
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
  onCameraChange(listener: (view: PlanView) => void): () => void;
  setPointerReceiver(receiver: PlanPointerReceiver | null): void;
};

export type PlanController = {
  handle: PlanCanvasHandle;
  attachCanvas(canvas: HTMLCanvasElement): Promise<'ready' | 'failed' | 'detached'>;
  detachCanvas(): void;
  attachSurface(surface: InputSurface | null): void;
  setCanvasRect(rect: ClientRect): void;
  setRegionRect(rect: ClientRect): void;
  stats(): PlanStats;
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
  o: { store: Pick<ModelStore, 'getState' | 'subscribe'> },
  deps: { createRoot: CreateRenderRoot; keys?: EventTarget; report?: (error: unknown) => void },
): PlanController {
  const report = deps.report ?? ((error: unknown) => void reportDefault(error));
  const scene = createPlanScene();
  let view: PlanView = { x: 0, y: 0, ppi: ZOOM_100_PPI };
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

  const rebuild = (): number => {
    const list = planDrawingList(o.store.getState().objects);
    bounds = drawingBounds(list);
    const before = scene.objectCount();
    const uploaded = scene.setBatches(buildPlanBatches(list));
    bufferUploads += uploaded;
    return uploaded > 0 || scene.objectCount() !== before ? 1 : 0;
  };
  rebuild();

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
    const ppi = clampPpi(next.ppi);
    if (next.x === view.x && next.y === view.y && ppi === view.ppi) return;
    view = { x: next.x, y: next.y, ppi };
    updateCamera();
    redraw();
    for (const l of [...listeners]) l.fn({ ...view });
  };

  const unsubscribe = o.store.subscribe((state, prev) => {
    if (state.objects === prev.objects) return;
    if (rebuild() > 0) redraw();
  });

  const handle: PlanCanvasHandle = {
    getCursor: () => input?.getCursor() ?? null,
    getPixelsPerInch: () => view.ppi,
    getView: () => ({ ...view }),
    setView,
    fit() {
      const size = regionSize();
      if (size !== null) setView(fitView(bounds, size));
    },
    modelToScreen: (p) => modelToRegion(view, p),
    screenToModel: (p) => regionToModel(view, p),
    onCameraChange(fn) {
      const entry = { fn };
      listeners.push(entry);
      return () => {
        const i = listeners.indexOf(entry);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    setPointerReceiver(next) {
      receiver = next;
    },
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
        setView(fitView(bounds, size));
        return;
      }
      updateCamera();
      redraw();
    },
    stats() {
      const s = root !== null && ready ? root.stats() : { frames: 0, drawCalls: 0 };
      return { frames: s.frames, drawCalls: s.drawCalls, bufferUploads };
    },
    dispose() {
      unsubscribe();
      input?.dispose();
      input = null;
      detachCanvas();
      listeners.length = 0;
      scene.dispose();
    },
  };
}

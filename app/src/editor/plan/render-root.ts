// EZD-207a Build step 10 (vault/plans/EZD-207a.md Decided "Camera"; R-054; 02 Stack 2D + 3D; 11 rule 4): one
// WebGLRenderer on the plan's <canvas>, drawn on demand, with an orthographic camera set by hand. The root adds no
// pointer listener; input is the plan's own (input.ts).
// EZD-1902 (editor plan 2026-11-23 lever L1; 11 Budgets editor download size): plain Three.js, no React Three Fiber.
// It keeps what the fiber root did for this canvas: the renderer settings (antialias, no alpha, high-performance,
// sRGB output, ACES filmic tone mapping), a pixel ratio of the device's clamped to 1..2 and followed when it changes,
// one frame per animation frame however many times it is asked for, none when nothing asked, and a camera that is
// not `manual` fitted to the size on resize.
// EZD-224b Build step 6 (vault/plans/EZD-224b.md Decided "WebGL read", "The one extra frame"; R-058): captureFrame
// asks for one more frame of the same view and reads the drawing buffer in three's `scene.onAfterRender`. The
// capture code (frame-capture.ts) loads with import() on the first capture, outside the editor's first download.
// EZD-1001a (11 rule 4 "Plan, 3D ... are scenes drawn into it, and a tab switch never creates or destroys a WebGL
// context"): `setScene` draws another scene (the lazy 3D scene) with its own camera into this same renderer, and
// `null` brings the plan back with its orthographic camera. Still drawn on demand.
// EZD-1972 (11 Budgets "first open of 3D within 1 second"): the plan's first frame also draws the 3D scene's shader
// warm-up (scene-warmup.ts), which leaves the scene once drawn, or when the 3D scene is shown before that.
import {
  ACESFilmicToneMapping,
  Color,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
  type Camera,
} from 'three';
import type { ThumbnailCapture } from '../../lib/thumbnail/thumbnail';
import { tokenRgb } from './color';
import type { CreateRenderRoot, SceneView } from './controller';
import type { FrameCapture } from './frame-capture';
import { createSceneWarmup, type SceneWarmup } from './scene-warmup';
import type { Size } from './view';

let contexts = 0;

export function webglContextsCreated(): number {
  return contexts;
}

// The device pixel ratio, kept within 1..2 (2 when the window gives none).
export function planPixelRatio(): number {
  const target = typeof window !== 'undefined' ? (window.devicePixelRatio ?? 2) : 1;
  return Math.min(Math.max(1, target), 2);
}

type ManualCamera = Camera & { manual?: boolean };

// A camera set by hand (`manual`) is left alone; any other is fitted to the canvas size.
function fitCamera(camera: ManualCamera, size: Size): void {
  if (camera.manual === true || size.height <= 0) return;
  if (camera instanceof OrthographicCamera) {
    camera.left = size.width / -2;
    camera.right = size.width / 2;
    camera.top = size.height / 2;
    camera.bottom = size.height / -2;
    camera.updateProjectionMatrix();
  } else if (camera instanceof PerspectiveCamera) {
    camera.aspect = size.width / size.height;
    camera.updateProjectionMatrix();
  }
}

export const createPlanRoot: CreateRenderRoot = (canvas, scene) => {
  let gl: WebGLRenderer | null = null;
  const root = new Scene();
  const planCamera = new OrthographicCamera(0, 0, 0, 0, 0.1, 1000);
  planCamera.position.z = 5;
  planCamera.lookAt(0, 0, 0);
  let camera: Camera = planCamera;
  let size: Size = { width: 0, height: 0 };
  let frame: number | null = null;
  let capture: FrameCapture<ThumbnailCapture> | null = null;
  let unmounted = false;
  let shown: SceneView | null = null;
  let warmup: SceneWarmup | null = null;
  let stopDpr: (() => void) | null = null;
  // The warm-up's lights must be gone before the 3D scene is drawn: one more light would be another shader.
  const endWarmup = () => {
    if (warmup !== null) root.remove(warmup.object);
  };

  const draw = () => {
    frame = null;
    if (gl !== null && !unmounted) gl.render(root, camera);
  };
  // On demand: one frame on the next animation frame, however many times it is asked for before then.
  const invalidate = () => {
    if (gl === null || unmounted || frame !== null) return;
    frame = requestAnimationFrame(draw);
  };

  const applySize = () => {
    if (gl === null) return;
    gl.setPixelRatio(planPixelRatio());
    gl.setSize(size.width, size.height, true);
    fitCamera(camera, size);
    scene.setViewport({ dpr: gl.getPixelRatio(), bufferHeight: gl.domElement.height });
    invalidate();
  };

  // Moving to another display or zooming the page changes the pixel ratio without resizing the canvas.
  const followDpr = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const onChange = () => {
      stopDpr?.();
      if (unmounted) return;
      applySize();
      followDpr();
    };
    query.addEventListener('change', onChange, { once: true });
    stopDpr = () => query.removeEventListener('change', onChange);
  };

  return {
    async start(first) {
      contexts += 1;
      gl = new WebGLRenderer({ canvas, powerPreference: 'high-performance', antialias: true, alpha: false });
      gl.outputColorSpace = SRGBColorSpace;
      gl.toneMapping = ACESFilmicToneMapping;
      const { r, g, b } = tokenRgb('--ez-canvas');
      gl.setClearColor(new Color().setRGB(r, g, b, SRGBColorSpace), 1);
      root.add(scene.group);
      root.onAfterRender = () => capture?.onFrame();
      // Taken out after the frame, not while the renderer is walking the scene.
      warmup = createSceneWarmup(() => queueMicrotask(endWarmup));
      root.add(warmup.object);
      size = { width: first.width, height: first.height };
      applySize();
      followDpr();
    },
    resize(next) {
      size = { width: next.width, height: next.height };
      applySize();
    },
    setCamera(f) {
      if (gl === null) return;
      planCamera.left = -f.halfWidth;
      planCamera.right = f.halfWidth;
      planCamera.top = f.halfHeight;
      planCamera.bottom = -f.halfHeight;
      planCamera.zoom = f.zoom;
      planCamera.position.set(f.centerX, f.centerY, 100);
      (planCamera as ManualCamera).manual = true;
      planCamera.updateProjectionMatrix();
    },
    invalidate,
    setScene(view) {
      if (gl === null || view === shown) return;
      if (view !== null) endWarmup();
      if (shown !== null) {
        root.remove(shown.object);
        shown.setInvalidate(null);
      }
      shown = view;
      if (view !== null) {
        root.add(view.object);
        scene.group.visible = false;
        if (view.camera instanceof PerspectiveCamera && size.height > 0) {
          view.camera.aspect = size.width / size.height;
          view.camera.updateProjectionMatrix();
        }
        camera = view.camera;
        view.setInvalidate(invalidate);
      } else {
        scene.group.visible = true;
        camera = planCamera;
      }
      invalidate();
    },
    stats() {
      if (gl === null) return { frames: 0, drawCalls: 0 };
      const { render } = gl.info;
      return { frames: render.frame, drawCalls: render.calls };
    },
    async captureFrame(source) {
      if (gl === null) throw new Error('plan.detached');
      const m = await import('./frame-capture');
      const current = gl;
      if (gl === null || unmounted) throw new Error('plan.detached');
      capture ??= m.createThumbnailCapture(invalidate);
      return capture.request(() => m.readThumbnail(current, source));
    },
    unmount() {
      unmounted = true;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      stopDpr?.();
      stopDpr = null;
      shown?.setInvalidate(null);
      if (shown !== null) root.remove(shown.object);
      shown = null;
      capture?.dispose();
      endWarmup();
      warmup?.dispose();
      warmup = null;
      root.onAfterRender = () => {};
      root.remove(scene.group);
      const renderer = gl;
      gl = null;
      if (renderer !== null) {
        renderer.dispose();
        renderer.forceContextLoss();
      }
    },
  };
};

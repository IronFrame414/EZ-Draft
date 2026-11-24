// EZD-207a Build step 10 (vault/plans/EZD-207a.md Decided "R3F root", "Camera"; R-054; 02 Stack 2D + 3D; 11 rule
// 4): one React Three Fiber root on the plan's <canvas>, drawn on demand, with an orthographic camera set by hand.
// R3F adds no pointer listener (no `events` option); input is the plan's own (input.ts).
// EZD-224b Build step 6 (vault/plans/EZD-224b.md Decided "WebGL read", "The one extra frame"; R-058): captureFrame
// asks for one more frame of the same view and reads the drawing buffer in three's `scene.onAfterRender`. The
// capture code (frame-capture.ts) loads with import() on the first capture, outside the editor's first download.
// EZD-1001a (11 rule 4 "Plan, 3D ... are scenes drawn into it, and a tab switch never creates or destroys a WebGL
// context"): `setScene` draws another scene (the lazy 3D scene) with its own camera into this same renderer, and
// `null` brings the plan back with its orthographic camera. Still drawn on demand.
// EZD-1972 (11 Budgets "first open of 3D within 1 second"): the plan's first frame also draws the 3D scene's shader
// warm-up (scene-warmup.ts), which leaves the scene once drawn, or when the 3D scene is shown before that.
import { createRoot, invalidate, type RootState } from '@react-three/fiber';
import { createElement } from 'react';
import { Color, OrthographicCamera, PerspectiveCamera, SRGBColorSpace, WebGLRenderer, type Camera } from 'three';
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

export const createR3fRoot: CreateRenderRoot = (canvas, scene) => {
  const root = createRoot(canvas);
  let state: (() => RootState) | null = null;
  let capture: FrameCapture<ThumbnailCapture> | null = null;
  let unmounted = false;
  let shown: SceneView | null = null;
  let planCamera: Camera | null = null;
  let warmup: SceneWarmup | null = null;
  // The warm-up's lights must be gone before the 3D scene is drawn: one more light would be another shader.
  const endWarmup = () => {
    if (warmup !== null && state !== null) state().scene.remove(warmup.object);
  };

  const config = (size: Size) => ({
    gl: (defaults: ConstructorParameters<typeof WebGLRenderer>[0]) => {
      contexts += 1;
      return new WebGLRenderer({ ...defaults, antialias: true, alpha: false });
    },
    frameloop: 'demand' as const,
    orthographic: true,
    dpr: [1, 2] as [number, number],
    size: { width: size.width, height: size.height, top: 0, left: 0 },
  });

  const applyViewport = () => {
    if (state === null) return;
    const { gl } = state();
    scene.setViewport({ dpr: gl.getPixelRatio(), bufferHeight: gl.domElement.height });
    invalidate(state());
  };

  return {
    async start(size) {
      await root.configure(config(size));
      const store = root.render(createElement('primitive', { object: scene.group }));
      state = store.getState;
      store.getState().scene.onAfterRender = () => capture?.onFrame();
      const { r, g, b } = tokenRgb('--ez-canvas');
      store.getState().gl.setClearColor(new Color().setRGB(r, g, b, SRGBColorSpace), 1);
      // Taken out after the frame, not while the renderer is walking the scene.
      warmup = createSceneWarmup(() => queueMicrotask(endWarmup));
      store.getState().scene.add(warmup.object);
      applyViewport();
    },
    resize(size) {
      void root.configure(config(size)).then(applyViewport);
    },
    setCamera(frame) {
      if (state === null) return;
      const camera = state().camera;
      if (!(camera instanceof OrthographicCamera)) return;
      camera.left = -frame.halfWidth;
      camera.right = frame.halfWidth;
      camera.top = frame.halfHeight;
      camera.bottom = -frame.halfHeight;
      camera.zoom = frame.zoom;
      camera.position.set(frame.centerX, frame.centerY, 100);
      (camera as OrthographicCamera & { manual?: boolean }).manual = true;
      camera.updateProjectionMatrix();
    },
    invalidate() {
      if (state !== null) invalidate(state());
    },
    setScene(view) {
      if (state === null || view === shown) return;
      if (view !== null) endWarmup();
      const s = state();
      const frame = () => {
        if (state !== null) invalidate(state());
      };
      if (shown !== null) {
        s.scene.remove(shown.object);
        shown.setInvalidate(null);
      } else {
        planCamera = s.camera;
      }
      shown = view;
      if (view !== null) {
        s.scene.add(view.object);
        scene.group.visible = false;
        if (view.camera instanceof PerspectiveCamera && s.size.height > 0) {
          view.camera.aspect = s.size.width / s.size.height;
          view.camera.updateProjectionMatrix();
        }
        s.set({ camera: view.camera as RootState['camera'] });
        view.setInvalidate(frame);
      } else {
        scene.group.visible = true;
        if (planCamera !== null) s.set({ camera: planCamera as RootState['camera'] });
        planCamera = null;
      }
      invalidate(s);
    },
    stats() {
      if (state === null) return { frames: 0, drawCalls: 0 };
      const { render } = state().gl.info;
      return { frames: render.frame, drawCalls: render.calls };
    },
    async captureFrame(source) {
      if (state === null) throw new Error('plan.detached');
      const m = await import('./frame-capture');
      const current = state;
      if (current === null || unmounted) throw new Error('plan.detached');
      capture ??= m.createThumbnailCapture(() => {
        if (state !== null) invalidate(state());
      });
      return capture.request(() => m.readThumbnail(current().gl, source));
    },
    unmount() {
      unmounted = true;
      shown?.setInvalidate(null);
      shown = null;
      capture?.dispose();
      endWarmup();
      warmup?.dispose();
      warmup = null;
      if (state !== null) state().scene.onAfterRender = () => {};
      state = null;
      root.unmount();
    },
  };
};

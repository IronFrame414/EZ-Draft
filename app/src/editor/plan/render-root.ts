// EZD-207a Build step 10 (vault/plans/EZD-207a.md Decided "R3F root", "Camera"; R-054; 02 Stack 2D + 3D; 11 rule
// 4): one React Three Fiber root on the plan's <canvas>, drawn on demand, with an orthographic camera set by hand.
// R3F adds no pointer listener (no `events` option); input is the plan's own (input.ts).
// EZD-224b Build step 6 (vault/plans/EZD-224b.md Decided "WebGL read", "The one extra frame"; R-058): captureFrame
// asks for one more frame of the same view and reads the drawing buffer in three's `scene.onAfterRender`. The
// capture code (frame-capture.ts) loads with import() on the first capture, outside the editor's first download.
import { createRoot, invalidate, type RootState } from '@react-three/fiber';
import { createElement } from 'react';
import { Color, OrthographicCamera, SRGBColorSpace, WebGLRenderer } from 'three';
import type { ThumbnailCapture } from '../../lib/thumbnail/thumbnail';
import { tokenRgb } from './color';
import type { CreateRenderRoot } from './controller';
import type { FrameCapture } from './frame-capture';
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
      capture?.dispose();
      if (state !== null) state().scene.onAfterRender = () => {};
      state = null;
      root.unmount();
    },
  };
};

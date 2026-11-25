// EZD-1902 (AC-EZD-1902-1 "render-root.ts makes one WebGLRenderer per canvas, draws on demand only, and keeps
// setScene, setCamera, resize, invalidate, stats, captureFrame and unmount with the same behaviour"; AC-EZD-1902-2
// "switching ... creates no second WebGL context"; 11 rule 4 "drawn only when something changes (no idle animation
// loop)", "a tab switch never creates or destroys a WebGL context"): the plain Three.js render root, with three's
// renderer replaced by a recorder (no WebGL in node). The settings it must keep are the ones the React Three Fiber
// root used (render-root.ts before EZD-1902: antialias on, alpha off, dpr [1, 2], frameloop 'demand').
import { Group, OrthographicCamera, PerspectiveCamera, type Camera, type Object3D, type Scene } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanScene } from './scene';

const h = vi.hoisted(() => {
  const made: FakeRenderer[] = [];
  class FakeRenderer {
    options: Record<string, unknown>;
    renders: Array<{ scene: Scene; camera: Camera }> = [];
    sizes: Array<[number, number, boolean | undefined]> = [];
    ratio = 1;
    domElement = { height: 0 };
    info = { render: { frame: 0, calls: 0 } };
    disposed = false;
    lost = false;
    toneMapping = 0;
    outputColorSpace = '';
    clear: unknown = null;
    constructor(options: Record<string, unknown>) {
      this.options = options;
      made.push(this);
    }
    setPixelRatio(r: number) {
      this.ratio = r;
    }
    getPixelRatio() {
      return this.ratio;
    }
    setSize(w: number, hh: number, style?: boolean) {
      this.sizes.push([w, hh, style]);
      this.domElement.height = Math.floor(hh * this.ratio);
    }
    setClearColor(c: unknown) {
      this.clear = c;
    }
    render(scene: Scene, camera: Camera) {
      this.renders.push({ scene, camera });
      this.info.render.frame += 1;
      this.info.render.calls = 7;
      scene.onAfterRender?.(this as never, scene, camera, null as never, null as never, null as never);
    }
    dispose() {
      this.disposed = true;
    }
    forceContextLoss() {
      this.lost = true;
    }
  }
  return { made, FakeRenderer };
});

vi.mock('three', async (importOriginal) => ({
  ...(await importOriginal<typeof import('three')>()),
  WebGLRenderer: h.FakeRenderer,
}));
vi.mock('./frame-capture', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./frame-capture')>()),
  readThumbnail: vi.fn(() => ({ image: 'pixels', crop: null })),
}));

const { createPlanRoot, planPixelRatio, webglContextsCreated } = await import('./render-root');
const capture = await import('./frame-capture');

let queue: Array<() => void> = [];
const runFrames = () => {
  const now = queue;
  queue = [];
  for (const f of now) f();
};

function fakeScene() {
  const group = new Group();
  const viewports: Array<{ dpr: number; bufferHeight: number }> = [];
  const scene = { group, setViewport: (v: { dpr: number; bufferHeight: number }) => viewports.push(v) };
  return { scene: scene as unknown as PlanScene, group, viewports };
}

function view3d() {
  const object = new Group();
  const camera = new PerspectiveCamera(50, 1, 0.1, 1000);
  const setInvalidate = vi.fn<(fn: (() => void) | null) => void>();
  return { object: object as Object3D, camera, setInvalidate };
}

beforeEach(() => {
  h.made.length = 0;
  queue = [];
  vi.stubGlobal('requestAnimationFrame', (f: () => void) => {
    queue.push(f);
    return queue.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    queue = [];
  });
  vi.stubGlobal('window', { devicePixelRatio: 1 });
});
afterEach(() => vi.unstubAllGlobals());

async function started(size = { width: 800, height: 600 }) {
  const s = fakeScene();
  const canvas = {} as HTMLCanvasElement;
  const root = createPlanRoot(canvas, s.scene);
  await root.start(size);
  const gl = h.made[h.made.length - 1]!;
  return { ...s, canvas, root, gl };
}

describe('EZD-1902 plain Three.js render root', () => {
  it('makes one WebGLRenderer on the canvas, antialiased and opaque, and counts one context', async () => {
    const before = webglContextsCreated();
    const { canvas, gl } = await started();
    expect(h.made).toHaveLength(1);
    expect(gl.options).toMatchObject({ canvas, antialias: true, alpha: false });
    expect(webglContextsCreated()).toBe(before + 1);
  });

  it('draws on demand only: one first frame, then nothing until asked, and one frame for many asks', async () => {
    const { root, gl } = await started();
    runFrames();
    expect(gl.renders).toHaveLength(1);
    runFrames();
    runFrames();
    expect(gl.renders).toHaveLength(1);
    root.invalidate();
    root.invalidate();
    root.invalidate();
    runFrames();
    expect(gl.renders).toHaveLength(2);
    runFrames();
    expect(gl.renders).toHaveLength(2);
  });

  it('draws the plan group with the orthographic camera that setCamera sets', async () => {
    const { root, gl, group } = await started();
    root.setCamera({ centerX: 120, centerY: -40, halfWidth: 400, halfHeight: 300, zoom: 2 });
    root.invalidate();
    runFrames();
    const { scene, camera } = gl.renders[gl.renders.length - 1]!;
    expect(scene.children).toContain(group);
    expect(camera).toBeInstanceOf(OrthographicCamera);
    const c = camera as OrthographicCamera;
    expect([c.left, c.right, c.top, c.bottom, c.zoom]).toEqual([-400, 400, 300, -300, 2]);
    expect([c.position.x, c.position.y, c.position.z]).toEqual([120, -40, 100]);
  });

  it('resize sizes the renderer with the device pixel ratio kept within 1..2 and tells the scene', async () => {
    vi.stubGlobal('window', { devicePixelRatio: 3 });
    expect(planPixelRatio()).toBe(2);
    vi.stubGlobal('window', { devicePixelRatio: 0.5 });
    expect(planPixelRatio()).toBe(1);
    vi.stubGlobal('window', { devicePixelRatio: 1.5 });
    const { root, gl, viewports } = await started({ width: 800, height: 600 });
    root.resize({ width: 1000, height: 500 });
    expect(gl.sizes[gl.sizes.length - 1]).toEqual([1000, 500, true]);
    expect(gl.getPixelRatio()).toBe(1.5);
    expect(viewports[viewports.length - 1]).toEqual({ dpr: 1.5, bufferHeight: 750 });
    runFrames();
    expect(gl.renders).toHaveLength(1);
  });

  it('setScene draws the 3D view with its camera in the same renderer, and null brings the plan back', async () => {
    const { root, gl, group } = await started({ width: 800, height: 400 });
    runFrames();
    const contexts = webglContextsCreated();
    const v = view3d();
    root.setScene!(v);
    runFrames();
    let last = gl.renders[gl.renders.length - 1]!;
    expect(last.camera).toBe(v.camera);
    expect(last.scene.children).toContain(v.object);
    expect(group.visible).toBe(false);
    expect(v.camera.aspect).toBe(2);
    // The view asks for its own frames through the function it is given.
    const ask = v.setInvalidate.mock.calls[0]![0]!;
    const n = gl.renders.length;
    ask();
    runFrames();
    expect(gl.renders).toHaveLength(n + 1);
    // A resize while 3D is shown fits its (not manual) camera.
    root.resize({ width: 900, height: 300 });
    expect(v.camera.aspect).toBe(3);

    root.setScene!(null);
    runFrames();
    last = gl.renders[gl.renders.length - 1]!;
    expect(last.camera).toBeInstanceOf(OrthographicCamera);
    expect(last.scene.children).not.toContain(v.object);
    expect(group.visible).toBe(true);
    expect(v.setInvalidate).toHaveBeenLastCalledWith(null);
    expect(h.made).toHaveLength(1);
    expect(webglContextsCreated()).toBe(contexts);
  });

  it('stats reads frames and draw calls from the renderer', async () => {
    const { root } = await started();
    expect(root.stats()).toEqual({ frames: 0, drawCalls: 0 });
    runFrames();
    expect(root.stats()).toEqual({ frames: 1, drawCalls: 7 });
  });

  it('captureFrame asks for one frame and reads the buffer in that frame', async () => {
    const { root, gl } = await started();
    runFrames();
    const source = { region: { left: 0, top: 0, width: 800, height: 600 } } as never;
    const pending = root.captureFrame(source);
    await vi.waitFor(() => expect(queue.length).toBe(1));
    runFrames();
    await expect(pending).resolves.toEqual({ image: 'pixels', crop: null });
    expect(capture.readThumbnail).toHaveBeenCalledWith(gl, source);
  });

  it('unmount frees the renderer and its context, and draws nothing after', async () => {
    const { root, gl } = await started();
    root.unmount();
    runFrames();
    expect(gl.renders).toHaveLength(0);
    expect(gl.disposed).toBe(true);
    expect(gl.lost).toBe(true);
    root.invalidate();
    runFrames();
    expect(gl.renders).toHaveLength(0);
    await expect(root.captureFrame({} as never)).rejects.toThrow('plan.detached');
  });
});

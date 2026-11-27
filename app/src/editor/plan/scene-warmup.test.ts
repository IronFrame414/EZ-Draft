// EZD-1972 (AC-EZD-1972-1 "the first open of 3D on the benchmark project is made faster"; AC-EZD-1972-3 "the 3D scene
// still draws into the plan's one renderer"): the warm-up the plan's first frame draws so the 3D scene's shader is
// built before the first press of 3D. three picks a shader by the material's settings, the mesh's attributes and
// the number of lights of each kind, so the warm-up must hold exactly what the 3D scene holds: one ambient light,
// one directional light, and a lit two-sided surface with positions and normals (scene.ts, EZD-1001a).
import {
  AmbientLight,
  Color,
  DirectionalLight,
  DoubleSide,
  Mesh,
  MeshLambertMaterial,
  type BufferGeometry,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  createSceneWarmup,
  FIRST_INPUT_EVENTS,
  IDLE_LOAD_TIMEOUT_MS,
  loadAfterFirstInput,
  sceneLights,
  sceneSurfaceMaterial,
  WARMUP_SCALE,
} from './scene-warmup';

// More pixels per inch than any screen at the plan's closest zoom (view.ts MAX_ZOOM_PERCENT, 1600 %).
const PIXELS_PER_INCH_NEVER_REACHED = 1e6;

describe('EZD-1972 3D shader warm-up', () => {
  it('holds one ambient light, one directional light and one lit two-sided triangle with positions and normals', () => {
    const warmup = createSceneWarmup(() => {});
    const kids = warmup.object.children;
    expect(kids.filter((c) => c instanceof AmbientLight)).toHaveLength(1);
    expect(kids.filter((c) => c instanceof DirectionalLight)).toHaveLength(1);
    const meshes = kids.filter((c): c is Mesh => c instanceof Mesh);
    expect(meshes).toHaveLength(1);
    expect(kids).toHaveLength(3);
    const mesh = meshes[0]!;
    expect(mesh.material).toBeInstanceOf(MeshLambertMaterial);
    expect((mesh.material as MeshLambertMaterial).side).toBe(DoubleSide);
    const g = mesh.geometry as BufferGeometry;
    expect(Object.keys(g.attributes).sort()).toEqual(['normal', 'position']);
    expect(g.index).toBeNull();
    expect(g.getAttribute('position').count).toBe(3);
  });

  it('is drawn whatever the camera sees, and covers no pixel', () => {
    const mesh = createSceneWarmup(() => {}).object.children.find(
      (c): c is Mesh => c instanceof Mesh,
    )!;
    expect(mesh.frustumCulled).toBe(false);
    expect(mesh.visible).toBe(true);
    // A triangle with 1" legs, scaled: its legs are a thousandth of a pixel at most.
    expect(mesh.scale.toArray()).toEqual([WARMUP_SCALE, WARMUP_SCALE, WARMUP_SCALE]);
    expect(WARMUP_SCALE * PIXELS_PER_INCH_NEVER_REACHED).toBeLessThanOrEqual(0.001);
  });

  it('reports the first frame that draws it, once', () => {
    const onDrawn = vi.fn();
    const warmup = createSceneWarmup(onDrawn);
    const mesh = warmup.object.children.find((c): c is Mesh => c instanceof Mesh)!;
    expect(warmup.drawn()).toBe(false);
    const draw = mesh.onAfterRender as unknown as () => void;
    draw();
    draw();
    expect(warmup.drawn()).toBe(true);
    expect(onDrawn).toHaveBeenCalledTimes(1);
  });

  it('dispose frees its geometry and its material', () => {
    const warmup = createSceneWarmup(() => {});
    const mesh = warmup.object.children.find((c): c is Mesh => c instanceof Mesh)!;
    const freed: string[] = [];
    mesh.geometry.addEventListener('dispose', () => freed.push('geometry'));
    (mesh.material as MeshLambertMaterial).addEventListener('dispose', () => freed.push('material'));
    warmup.dispose();
    expect(freed.sort()).toEqual(['geometry', 'material']);
  });

  it('the scene material is the given colour, lit, with both sides drawn; the lights are one of each kind', () => {
    const m = sceneSurfaceMaterial(new Color(0x336699));
    expect(m).toBeInstanceOf(MeshLambertMaterial);
    expect(m.color.getHex()).toBe(0x336699);
    expect(m.side).toBe(DoubleSide);
    const [ambient, sun] = sceneLights();
    expect(ambient).toBeInstanceOf(AmbientLight);
    expect(sun).toBeInstanceOf(DirectionalLight);
    // EZD-1001a: from the south-west, above.
    expect(sun.position.toArray()).toEqual([-0.4, -0.7, 1]);
  });
});

// EZD-2009 (AC-EZD-2009-1 "what the first click still pays for is ... loaded while the editor is idle"): the load is
// asked for once, at the first idle moment after the first input, and never with no user action (11 rule 7).
type Listener = () => void;
function fakeWindow(o: { idle: boolean }) {
  const listeners = new Map<string, Set<Listener>>();
  const options: unknown[] = [];
  const idle: Array<{ id: number; cb: () => void; timeout: number | undefined }> = [];
  const timers: Array<{ id: number; cb: () => void; ms: number | undefined }> = [];
  let next = 1;
  const win = {
    addEventListener(type: string, cb: Listener, opts?: unknown) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(cb);
      options.push(opts);
    },
    removeEventListener(type: string, cb: Listener) {
      listeners.get(type)?.delete(cb);
    },
    setTimeout(cb: () => void, ms?: number) {
      timers.push({ id: next, cb, ms });
      return next++;
    },
    clearTimeout(id: number) {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    ...(o.idle
      ? {
          requestIdleCallback(cb: () => void, opts?: { timeout: number }) {
            idle.push({ id: next, cb, timeout: opts?.timeout });
            return next++;
          },
          cancelIdleCallback(id: number) {
            const i = idle.findIndex((t) => t.id === id);
            if (i >= 0) idle.splice(i, 1);
          },
        }
      : {}),
  };
  return {
    win: win as unknown as Parameters<typeof loadAfterFirstInput>[1],
    fire: (type: string) => [...(listeners.get(type) ?? [])].forEach((cb) => cb()),
    listening: () => [...listeners].filter(([, set]) => set.size > 0).map(([type]) => type).sort(),
    options,
    idle,
    timers,
  };
}

describe('EZD-2009 the 3D scene chunk loads at the first idle moment after the first input', () => {
  it('the first input is a pointer move, a pointer press or a key press; the idle wait is at most 2,000 ms', () => {
    expect([...FIRST_INPUT_EVENTS]).toEqual(['pointermove', 'pointerdown', 'keydown']);
    expect(IDLE_LOAD_TIMEOUT_MS).toBe(2000);
  });

  it('with no user action nothing is loaded and nothing is scheduled', () => {
    const f = fakeWindow({ idle: true });
    const load = vi.fn();
    loadAfterFirstInput(load, f.win);
    expect(f.listening()).toEqual(['keydown', 'pointerdown', 'pointermove']);
    // Passive listeners in the capture phase: they never hold up a pan and see input other code stops.
    for (const o of f.options) expect(o).toEqual({ capture: true, passive: true });
    expect(load).not.toHaveBeenCalled();
    expect(f.idle).toHaveLength(0);
    expect(f.timers).toHaveLength(0);
  });

  it.each(FIRST_INPUT_EVENTS)('a %s does not load at once: the load waits for the idle moment, then runs once', (type) => {
    const f = fakeWindow({ idle: true });
    const load = vi.fn();
    loadAfterFirstInput(load, f.win);
    f.fire(type);
    // Still inside the input's own task: nothing loaded yet.
    expect(load).not.toHaveBeenCalled();
    expect(f.idle).toHaveLength(1);
    expect(f.idle[0]!.timeout).toBe(2000);
    // Later input schedules nothing more.
    expect(f.listening()).toEqual([]);
    for (const again of FIRST_INPUT_EVENTS) f.fire(again);
    expect(f.idle).toHaveLength(1);
    f.idle[0]!.cb();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('where there is no requestIdleCallback (WebKit) the load runs on a zero timer after the input', () => {
    const f = fakeWindow({ idle: false });
    const load = vi.fn();
    loadAfterFirstInput(load, f.win);
    f.fire('pointerdown');
    expect(load).not.toHaveBeenCalled();
    expect(f.timers).toHaveLength(1);
    expect(f.timers[0]!.ms).toBe(0);
    f.timers[0]!.cb();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('cancel before the input stops listening; cancel before the idle moment drops the load', () => {
    const early = fakeWindow({ idle: true });
    const load = vi.fn();
    loadAfterFirstInput(load, early.win)();
    expect(early.listening()).toEqual([]);
    early.fire('pointermove');
    expect(early.idle).toHaveLength(0);

    const late = fakeWindow({ idle: true });
    const cancel = loadAfterFirstInput(load, late.win);
    late.fire('keydown');
    expect(late.idle).toHaveLength(1);
    cancel();
    expect(late.idle).toHaveLength(0);

    const timer = fakeWindow({ idle: false });
    const cancelTimer = loadAfterFirstInput(load, timer.win);
    timer.fire('keydown');
    cancelTimer();
    expect(timer.timers).toHaveLength(0);
    expect(load).not.toHaveBeenCalled();
  });
});

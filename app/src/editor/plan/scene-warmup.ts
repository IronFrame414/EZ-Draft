// EZD-1972 (11 Budgets "first open of 3D within 1 second"; AC-EZD-1972-1): the 3D scene's shader, made ready before
// the 3D tab is first pressed. Measured 2026-11-24 on the benchmark project: of the first open's time, most was the
// graphics driver building the lit surface shader the first time anything is drawn with it (about 100 of 170 ms on
// the build Mac's software renderer, the same renderer CI uses; later frames of the whole scene take about 30 ms).
// The number of meshes, the sides drawn and the antialiasing made no measurable difference.
// So the plan's first frame also draws one triangle too small to cover a pixel, with the 3D scene's material under
// the 3D scene's lights, and the driver builds that shader then. The lights and the triangle leave the plan's scene
// as soon as that frame is drawn. No 3D scene code runs and no mesh is built: `lazy/scene-3d` still loads on the
// first press of 3D (11 rule 7).
// The material and the lights are made here for both the warm-up and the scene (scene.ts), so the two always ask
// the renderer for the same shader: three picks it by the material's settings and the number of lights of each kind.
// EZD-2009 (AC-EZD-2009-1; flaky-test audit 2026-11-27 row 2): what the first press of 3D still paid for after the
// shader was the download of the lazy `scene-3d` chunk (measured in e2e/perf-scene-3d-first-open.spec.ts). So that
// chunk is asked for while the editor is idle (`loadAfterFirstInput`, below): at the first idle moment after the
// person first moves the pointer, touches or types in the editor. With no user action nothing is downloaded, so the
// editor route's own download holds no 3D scene code (11 rule 7; AC-EZD-1001a-2). No scene is built until 3D is
// pressed.
import {
  AmbientLight,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshLambertMaterial,
} from 'three';

// Every surface of the 3D scene. Both sides drawn, so a face lights the same whichever way its triangles wind.
export function sceneSurfaceMaterial(color: Color): MeshLambertMaterial {
  return new MeshLambertMaterial({ color, side: DoubleSide });
}

// The 3D scene's lights: one ambient, one directional from the south-west, above.
export function sceneLights(): [AmbientLight, DirectionalLight] {
  const sun = new DirectionalLight(0xffffff, 1.8);
  sun.position.set(-0.4, -0.7, 1);
  return [new AmbientLight(0xffffff, 1.6), sun];
}

// The triangle's size in model inches: far below one pixel at any zoom the plan allows, so it never shows.
export const WARMUP_SCALE = 1e-9;

export type SceneWarmup = {
  // Added to the renderer's scene for one frame.
  object: Group;
  drawn(): boolean;
  dispose(): void;
};

// `onDrawn` is called once, during the first frame that draws the triangle.
export function createSceneWarmup(onDrawn: () => void): SceneWarmup {
  const object = new Group();
  object.name = 'scene-3d-warmup';
  object.add(...sceneLights());
  // Positions and normals, not indexed: the attributes every mesh of the 3D scene has.
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.computeVertexNormals();
  // Kept until dispose: the renderer drops a shader when the last material using it is disposed.
  const material = sceneSurfaceMaterial(new Color(0xffffff));
  const mesh = new Mesh(geometry, material);
  mesh.scale.setScalar(WARMUP_SCALE);
  // Drawn wherever the camera looks.
  mesh.frustumCulled = false;
  let drawn = false;
  mesh.onAfterRender = () => {
    if (drawn) return;
    drawn = true;
    onDrawn();
  };
  object.add(mesh);
  return {
    object,
    drawn: () => drawn,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

type InputWindow = Pick<Window, 'addEventListener' | 'removeEventListener' | 'setTimeout' | 'clearTimeout'> & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

// The first of these on the window is the person's first action in the editor. A pointer reaches the 3D tab only
// by moving; a finger or a key press that is itself the press of 3D still pays for the download.
export const FIRST_INPUT_EVENTS = ['pointermove', 'pointerdown', 'keydown'] as const;

// The longest wait for an idle moment after the first input.
export const IDLE_LOAD_TIMEOUT_MS = 2000;

// EZD-2009: calls `load` once, at the first idle moment (requestIdleCallback, at most IDLE_LOAD_TIMEOUT_MS; a zero
// timer where there is none, as in WebKit) after the first input on `win`. Returns a cancel function; after
// cancel, `load` is never called.
export function loadAfterFirstInput(load: () => void, win: InputWindow = window): () => void {
  let cancelIdle: (() => void) | null = null;
  const unlisten = () => {
    for (const type of FIRST_INPUT_EVENTS) win.removeEventListener(type, onInput, true);
  };
  const onInput = () => {
    unlisten();
    if (win.requestIdleCallback) {
      const id = win.requestIdleCallback(load, { timeout: IDLE_LOAD_TIMEOUT_MS });
      cancelIdle = () => win.cancelIdleCallback?.(id);
    } else {
      const id = win.setTimeout(load, 0);
      cancelIdle = () => win.clearTimeout(id);
    }
  };
  for (const type of FIRST_INPUT_EVENTS) win.addEventListener(type, onInput, { capture: true, passive: true });
  return () => {
    unlisten();
    cancelIdle?.();
  };
}

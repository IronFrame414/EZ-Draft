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

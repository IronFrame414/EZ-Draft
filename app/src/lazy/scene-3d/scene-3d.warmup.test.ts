// EZD-1972 (AC-EZD-1972-1): the 3D scene of the benchmark project asks the renderer for the shader the plan's first
// frame already built (editor/plan/scene-warmup.ts). three picks a shader by the material's settings, the mesh's
// attributes and the number of lights of each kind, so the first open of 3D builds no shader only while every mesh
// and light of the scene matches the warm-up in those three. The counts are the benchmark mix (EZD-236): the open
// floor is one of 2 equal floors, so 1516 / 2 walls and 720 / 2 rooms, each room with a floor and a ceiling.
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
import { BENCHMARK_MIX, generateBenchmarkModel } from '@ezdraft/geometry/benchmark';
import { AmbientLight, DirectionalLight, Light, Mesh, type Material, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { createModelStore } from '../../editor/model/model-store';
import { createSceneWarmup } from '../../editor/plan/scene-warmup';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { createScene3d } from './scene';

// A material's settings without what never changes the shader: its identity and its colour (a uniform).
function settings(m: Material): Record<string, unknown> {
  const { uuid: _uuid, color: _color, metadata: _metadata, ...rest } = m.toJSON();
  void [_uuid, _color, _metadata];
  return rest;
}

const meshesOf = (o: Object3D) => o.children.filter((c): c is Mesh => c instanceof Mesh);
const lightKinds = (o: Object3D) => ({
  ambient: o.children.filter((c) => c instanceof AmbientLight).length,
  directional: o.children.filter((c) => c instanceof DirectionalLight).length,
  all: o.children.filter((c) => c instanceof Light).length,
});

describe('EZD-1972 the 3D scene draws with the warmed shader', () => {
  const store = createModelStore({
    objects: new Map(
      generateBenchmarkModel().map((o) => [
        o.id,
        {
          type: o.type,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          data: o.data as Record<string, unknown>,
        } satisfies ObjectValue,
      ]),
    ),
  });
  const scene = createScene3d({ store });
  const warmup = createSceneWarmup(() => {});
  const warm = meshesOf(warmup.object)[0]!;

  it('the benchmark scene is the open floor: 758 walls, 360 floors and 360 ceilings', () => {
    const s = scene.stats();
    expect(s.walls).toBe(BENCHMARK_MIX.wall / 2);
    expect(s.floors).toBe(BENCHMARK_MIX.room / 2);
    expect(s.ceilings).toBe(BENCHMARK_MIX.room / 2);
    // Every one is drawn in the scene's group, with the frame probe.
    expect(meshesOf(scene.object)).toHaveLength(758 + 360 + 360 + 1);
  });

  it('every mesh has the warm-up material settings', () => {
    const want = settings(warm.material as Material);
    const materials = new Set(meshesOf(scene.object).map((m) => m.material as Material));
    // Walls, floors, ceilings and beams each have their own material; no beams in the benchmark project.
    expect(materials.size).toBe(3);
    for (const m of materials) expect(settings(m)).toEqual(want);
  });

  // A mesh without normals is drawn flat shaded, with another shader: the frame probe (no vertices) counts too.
  it('every mesh, the frame probe too, has the warm-up triangle attributes: positions and normals, not indexed', () => {
    const want = Object.keys(warm.geometry.attributes).sort();
    expect(want).toEqual(['normal', 'position']);
    expect(warm.geometry.index).toBeNull();
    const meshes = meshesOf(scene.object);
    expect(meshes.filter((m) => m.geometry.getAttribute('position').count === 0)).toHaveLength(1);
    for (const m of meshes) {
      expect(Object.keys(m.geometry.attributes).sort()).toEqual(want);
      expect(m.geometry.index).toBeNull();
    }
  });

  it('the scene has the warm-up lights: one ambient and one directional, no other', () => {
    expect(lightKinds(warmup.object)).toEqual({ ambient: 1, directional: 1, all: 2 });
    expect(lightKinds(scene.object)).toEqual({ ambient: 1, directional: 1, all: 2 });
  });
});

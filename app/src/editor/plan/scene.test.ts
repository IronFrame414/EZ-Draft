// EZD-207a U8 (vault/plans/EZD-207a.md section 4; Decided "Upload rule", "Materials"; AC-EZD-207-4).
// The seven batches are the ones U7 expects for the fixture list FX (same keys, orders and vertex counts).
import type { DrawingItem } from '@ezdraft/geometry';
import { Color, SRGBColorSpace, type Mesh, type MeshBasicMaterial } from 'three';
import { describe, expect, test } from 'vitest';
import type { PlanBatch } from './batches';
import { tokenRgb } from './color';
import { layoutText } from './glyph-atlas';
import { createPlanScene } from './scene';

const SPEC: Array<
  [string, 'segments' | 'fill', PlanBatch['layer'], PlanBatch['role'], number, number]
> = [
  ['rooms:segments:beyond', 'segments', 'rooms', 'beyond', 1, 6],
  ['existing:fill', 'fill', 'existing', null, 2, 6],
  ['new:fill', 'fill', 'new', null, 2, 3],
  ['demo:segments:beyond', 'segments', 'demo', 'beyond', 3, 2],
  ['existing:segments:cut', 'segments', 'existing', 'cut', 3, 4],
  ['existing:segments:hidden', 'segments', 'existing', 'hidden', 3, 36],
  ['dimensions:segments:dimension', 'segments', 'dimensions', 'dimension', 4, 2],
];

function batches(): PlanBatch[] {
  return SPEC.map(([key, kind, layer, role, order, vertices]) => ({
    key,
    kind,
    layer,
    role,
    color: { r: 0.5, g: 0.5, b: 0.5 },
    order,
    positions: Float32Array.from({ length: vertices * 3 }, (_, i) => i + order),
  }));
}

describe('EZD-207a scene', () => {
  test('EZD-207a U8 setBatches uploads only new or changed batches, orders them, and dispose empties the group', () => {
    const scene = createPlanScene();
    expect(scene.setBatches(batches())).toBe(7);
    expect(scene.objectCount()).toBe(7);

    const objects = () => scene.group.children.filter((c) => c.renderOrder !== 0);
    expect(objects()).toHaveLength(7);
    // The fixture's first position value equals its batch order, so each object's renderOrder is checked against
    // its own geometry.
    for (const c of objects()) {
      const geometry = (
        c as unknown as { geometry: { attributes: { position: { array: ArrayLike<number> } } } }
      ).geometry;
      expect(c.renderOrder).toBe(geometry.attributes.position.array[0]);
    }
    const grid = scene.group.children.filter((c) => c.renderOrder === 0);
    expect(grid).toHaveLength(1);
    expect(grid[0].frustumCulled).toBe(false);

    expect(scene.setBatches(batches())).toBe(0);
    expect(scene.objectCount()).toBe(7);

    const next = batches()
      .filter((b) => b.key !== 'new:fill')
      .map((b) =>
        b.key === 'existing:segments:cut' ? { ...b, positions: b.positions.map((v) => v + 1) } : b,
      );
    expect(scene.setBatches(next)).toBe(1);
    expect(scene.objectCount()).toBe(6);

    scene.dispose();
    expect(scene.group.children).toHaveLength(0);
  });
});

// EZD-207b U10, U11 (vault/plans/EZD-207b.md section 4; Decided "Text material", "Text uploads", "Highlight").
const OBJ = '00000000-0000-4000-8000-0000000000aa';
const textItems: DrawingItem[] = [
  {
    kind: 'text',
    layer: 'rooms',
    objectId: OBJ,
    text: 'R·R',
    font: 'instrument-sans-600',
    sizePt: 10,
    letterSpacingPt: 1,
    widthPt: 16.72,
    at: { x: 0, y: 0 },
    rotationDeg: 0,
    align: 'center',
  },
  {
    kind: 'text',
    layer: 'dimensions',
    objectId: OBJ,
    text: "10'",
    font: 'dm-mono-400',
    sizePt: 10,
    widthPt: 18,
    at: { x: 60, y: 30 },
    rotationDeg: 0,
    align: 'center',
  },
];
const mixed = () => layoutText({ level: 'L', items: textItems, omitted: [] });
const copyOf = (b: ReturnType<typeof layoutText>) => ({
  glyphs: b.glyphs,
  positions: Float32Array.from(b.positions),
  uvs: Float32Array.from(b.uvs),
  colors: Float32Array.from(b.colors),
});
const textMeshes = (scene: ReturnType<typeof createPlanScene>) =>
  scene.group.children.filter(
    (c) => (c as Mesh).material && (c as Mesh<never, MeshBasicMaterial>).material.alphaMap != null,
  ) as Array<Mesh<never, MeshBasicMaterial>>;

describe('EZD-207b scene text and highlight', () => {
  test('EZD-207b U10 one text mesh from one atlas texture, uploaded only when the batch changes', () => {
    const scene = createPlanScene();
    expect(() => scene.setText(mixed())).toThrow('glyph atlas not set');
    const image = { width: 1024, height: 1024 } as HTMLCanvasElement;
    scene.setAtlas(image);
    expect(scene.setText(mixed())).toBe(1);
    expect(scene.setText(copyOf(mixed()))).toBe(0);
    const moved = copyOf(mixed());
    moved.positions[0] += 1;
    expect(scene.setText(moved)).toBe(1);

    const meshes = textMeshes(scene);
    expect(meshes).toHaveLength(1);
    const mesh = meshes[0];
    expect(mesh.material.alphaMap!.image).toBe(image);
    expect(mesh.renderOrder).toBe(5);
    expect(mesh.material.vertexColors).toBe(true);
    expect(mesh.material.transparent).toBe(true);
    expect(scene.objectCount()).toBe(0);

    expect(
      scene.setText({
        glyphs: 0,
        positions: new Float32Array(0),
        uvs: new Float32Array(0),
        colors: new Float32Array(0),
      }),
    ).toBe(0);
    expect(textMeshes(scene)).toHaveLength(0);
    expect(scene.objectCount()).toBe(0);
  });

  test('EZD-207b U11 the highlight is one translucent cobalt mesh, uploaded only when it changes', () => {
    const scene = createPlanScene();
    const tris = () => Float32Array.from([0, 0, 0, 10, 0, 0, 10, 4, 0, 0, 0, 0, 10, 4, 0, 0, 4, 0]);
    expect(scene.setHighlight(tris())).toBe(1);
    expect(scene.setHighlight(tris())).toBe(0);
    const mesh = scene.group.children.find((c) => c.renderOrder === 2.5) as Mesh<
      never,
      MeshBasicMaterial
    >;
    expect(mesh).toBeDefined();
    expect(mesh.material.opacity).toBeCloseTo(0.35, 9);
    expect(mesh.material.transparent).toBe(true);
    const c = tokenRgb('--ez-cobalt');
    const want = new Color().setRGB(c.r, c.g, c.b, SRGBColorSpace);
    expect(mesh.material.color.r).toBeCloseTo(want.r, 6);
    expect(mesh.material.color.g).toBeCloseTo(want.g, 6);
    expect(mesh.material.color.b).toBeCloseTo(want.b, 6);
    expect(scene.objectCount()).toBe(0);
    expect(scene.setHighlight(new Float32Array(0))).toBe(0);
    expect(scene.group.children.find((c2) => c2.renderOrder === 2.5)).toBeUndefined();
    expect(scene.objectCount()).toBe(0);
  });
});

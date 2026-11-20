// EZD-304 (S01 PDF: scale calibration "Required before tracing"; 08 Imports "Underlay for tracing"): the plan scene's
// PDF underlay. Expected: one see-through textured quad at the corners given (the fixture page's plan corners,
// 816 x 528 in with the interior south-west corner at the origin: scale-calibration.test.ts), drawn above the grid
// (render order 0) and under rooms (1); it is not a batch object, is never picked, and null or dispose removes it.
import type { Mesh, MeshBasicMaterial } from 'three';
import { describe, expect, test } from 'vitest';
import { createPlanScene, UNDERLAY_OPACITY, UNDERLAY_RENDER_ORDER } from './scene';

const CORNERS = [
  { x: -336, y: 328 },
  { x: 480, y: 328 },
  { x: 480, y: -200 },
  { x: -336, y: -200 },
];
const image = { width: 8, height: 6 } as unknown as HTMLCanvasElement;
const underlayOf = (group: { children: unknown[] }) =>
  group.children.find((c) => (c as Mesh).name === 'pdf-underlay') as Mesh | undefined;

describe('EZD-304 plan underlay', () => {
  test('one see-through quad at the given corners, above the grid and under rooms, never picked', () => {
    const scene = createPlanScene();
    scene.setUnderlay({ image, corners: CORNERS });
    const mesh = underlayOf(scene.group);
    expect(mesh).toBeDefined();
    if (mesh === undefined) return;
    expect(UNDERLAY_RENDER_ORDER).toBeGreaterThan(0);
    expect(UNDERLAY_RENDER_ORDER).toBeLessThan(1);
    expect(mesh.renderOrder).toBe(UNDERLAY_RENDER_ORDER);
    const pos = Array.from(mesh.geometry.getAttribute('position').array as ArrayLike<number>);
    expect(pos).toEqual(CORNERS.flatMap((c) => [c.x, c.y, 0]));
    expect(Array.from(mesh.geometry.getIndex()?.array ?? [])).toEqual([0, 3, 1, 1, 3, 2]);
    const material = mesh.material as MeshBasicMaterial;
    expect(material.map?.image).toBe(image);
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(UNDERLAY_OPACITY);
    expect(material.depthTest).toBe(false);
    const hits: unknown[] = [];
    mesh.raycast({} as never, hits as never);
    expect(hits).toEqual([]);
    expect(scene.objectCount()).toBe(0);
  });

  test('a second underlay replaces the first; null and dispose remove it', () => {
    const scene = createPlanScene();
    scene.setUnderlay({ image, corners: CORNERS });
    scene.setUnderlay({ image, corners: CORNERS.map((c) => ({ x: c.x * 2, y: c.y * 2 })) });
    expect(scene.group.children.filter((c) => c.name === 'pdf-underlay')).toHaveLength(1);
    scene.setUnderlay(null);
    expect(underlayOf(scene.group)).toBeUndefined();
    scene.setUnderlay({ image, corners: CORNERS });
    scene.dispose();
    expect(underlayOf(scene.group)).toBeUndefined();
  });
});

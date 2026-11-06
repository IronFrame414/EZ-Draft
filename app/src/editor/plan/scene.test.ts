// EZD-207a U8 (vault/plans/EZD-207a.md section 4; Decided "Upload rule", "Materials"; AC-EZD-207-4).
// The seven batches are the ones U7 expects for the fixture list FX (same keys, orders and vertex counts).
import { describe, expect, test } from 'vitest';
import type { PlanBatch } from './batches';
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

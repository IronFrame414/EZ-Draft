// EZD-303 mesh view (phase-03 EZD-303 "toggleable mesh view"; 08 "Reference only, never model data"). Expected
// values come from fixtures/synthetic/room-12x10-sloped.glb.expected.json (`triangleCount`, `interior`, `ceiling`)
// and fixtures/README.md (plan x east, y north, origin at the south-west interior corner), never from a run.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Raycaster, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createMeshUnderlay } from '.';
import { readGlb } from '../../lib/imports/polycam-glb/read-glb';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const GLB = path.join(repo, 'fixtures/synthetic/room-12x10-sloped.glb');
const expected = JSON.parse(readFileSync(`${GLB}.expected.json`, 'utf8'));
const tol = expected.tolerances.inches as number;

describe('EZD-303 mesh underlay', () => {
  const object = createMeshUnderlay(readGlb(new Uint8Array(readFileSync(GLB))));

  it('holds every triangle of the fixture in plan inches', () => {
    const pos = object.geometry.getAttribute('position');
    expect(pos.count).toBe(expected.triangleCount * 3);
    const box = object.geometry.boundingBox!;
    const want = {
      min: [0, 0, 0],
      max: [expected.interior.widthIn, expected.interior.depthIn, expected.ceiling.highWall.heightIn],
    };
    (['x', 'y', 'z'] as const).forEach((k, i) => {
      expect(Math.abs(box.min[k] - want.min[i])).toBeLessThanOrEqual(tol);
      expect(Math.abs(box.max[k] - want.max[i])).toBeLessThanOrEqual(tol);
    });
  });

  it('starts hidden, is see-through and can never be picked', () => {
    expect(object.visible).toBe(false);
    const material = object.material as { transparent: boolean; opacity: number };
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBeLessThan(1);
    object.visible = true;
    const ray = new Raycaster(new Vector3(72, 60, 500), new Vector3(0, 0, -1));
    expect(ray.intersectObject(object)).toEqual([]);
  });
});

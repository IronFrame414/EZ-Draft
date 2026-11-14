// EZD-307 (AC-EZD-307-2 "Show 3D mesh toggles the mesh"; S02 Show 3D mesh; 08 "Reference only"). Expected values from
// fixtures/synthetic/room-12x10-sloped.glb.expected.json (`triangleCount`, `interior`, `ceiling.highWall`) and
// fixtures/README.md (plan x east, y north, origin at the south-west interior corner), never from a run. The
// canvas is a stand-in that records what is drawn (no DOM in the unit project).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readGlb } from '../../lib/imports/polycam-glb/read-glb';
import { createMeshView, fetchGlb, planInches } from '.';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const GLB = path.join(repo, 'fixtures/synthetic/room-12x10-sloped.glb');
const expected = JSON.parse(readFileSync(`${GLB}.expected.json`, 'utf8'));
const tol = expected.tolerances.inches as number;
const mesh = readGlb(new Uint8Array(readFileSync(GLB)));

function fakeCanvas() {
  const fills: number[] = [];
  let cleared = 0;
  const ctx = {
    setTransform() {},
    clearRect() {
      cleared += 1;
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {
      fills.push(1);
    },
    stroke() {},
    lineWidth: 1,
    fillStyle: '',
    strokeStyle: '',
  };
  const canvas = {
    clientWidth: 800,
    clientHeight: 600,
    width: 0,
    height: 0,
    getContext: () => ctx,
    addEventListener() {},
    removeEventListener() {},
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, fills, cleared: () => cleared };
}

describe('EZD-307 mesh view', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('holds every triangle of the fixture in plan inches', () => {
    const pts = planInches(mesh);
    expect(pts.length).toBe(expected.triangleCount * 9);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pts.length; i++) {
      min[i % 3] = Math.min(min[i % 3], pts[i]);
      max[i % 3] = Math.max(max[i % 3], pts[i]);
    }
    const want = {
      min: [0, 0, 0],
      max: [
        expected.interior.widthIn,
        expected.interior.depthIn,
        expected.ceiling.highWall.heightIn,
      ],
    };
    for (let k = 0; k < 3; k++) {
      expect(Math.abs(min[k] - want.min[k])).toBeLessThanOrEqual(tol);
      expect(Math.abs(max[k] - want.max[k])).toBeLessThanOrEqual(tol);
    }
  });

  it('AC-EZD-307-2: starts hidden; Show 3D mesh draws every triangle, and off draws none', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    const { canvas, fills } = fakeCanvas();
    const view = createMeshView(canvas, mesh);
    expect(view.triangleCount).toBe(expected.triangleCount);
    expect(view.visible).toBe(false);
    view.setVisible(true);
    expect(view.visible).toBe(true);
    expect(fills.length).toBe(expected.triangleCount);
    view.setVisible(false);
    expect(view.visible).toBe(false);
    expect(fills.length).toBe(expected.triangleCount);
    view.setVisible(true);
    expect(fills.length).toBe(expected.triangleCount * 2);
    view.dispose();
  });

  it('reads the GLB from its link', async () => {
    const bytes = readFileSync(GLB);
    const got = await fetchGlb(
      'https://storage.example.test/mesh.glb',
      async () => new Response(bytes),
    );
    expect(got.triangleCount).toBe(expected.triangleCount);
    await expect(
      fetchGlb('https://storage.example.test/x', async () => new Response(null, { status: 404 })),
    ).rejects.toThrow();
  });
});

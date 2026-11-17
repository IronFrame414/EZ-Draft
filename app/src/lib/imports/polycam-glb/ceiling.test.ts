// EZD-303 AC-EZD-303-1 (phase-03 EZD-303 Done when: "heights and slope read from the fixture GLB match its expected
// JSON"). Expected values come from the hand-written fixtures/synthetic/room-12x10-sloped.glb.expected.json
// (`ceiling`, `tolerances`, `positionMin`/`positionMax`, `triangleCount`), never from a run. AC-EZD-303-2 (the mesh
// toggle in review) is tested in EZD-307.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ceilingHeightAt, ceilingMesh, readCeiling } from './ceiling';
import { GlbReadError, readGlb } from './read-glb';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const fixture = (rel: string) => path.join(repo, rel);
const GLB = 'fixtures/synthetic/room-12x10-sloped.glb';

type Corner = { at: [number, number]; heightIn: number };
const expected = JSON.parse(readFileSync(fixture(`${GLB}.expected.json`), 'utf8')) as {
  tolerances: { metres: number; inches: number; pitchPer12: number; slopeDeg: number };
  triangleCount: number;
  positionMin: number[];
  positionMax: number[];
  ceiling: {
    cornerHeightsIn: Record<'SW' | 'NW' | 'SE' | 'NE', Corner>;
    lowWall: { side: string; heightIn: number };
    highWall: { side: string; heightIn: number };
    pitchPer12: number;
    slopeDeg: number;
    centre: Corner;
    heightAtWestIn: number;
    rise: number;
    run: number;
  };
};
const tol = expected.tolerances;
const near = (actual: number | null | undefined, want: number, within: number) => {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual as number) - want)).toBeLessThanOrEqual(within);
};

const mesh = readGlb(new Uint8Array(readFileSync(fixture(GLB))));

describe('EZD-303 Polycam GLB mesh: read the fixture', () => {
  it('reads every triangle in glTF metres within the expected extent', () => {
    expect(mesh.triangleCount).toBe(expected.triangleCount);
    expect(mesh.skippedPrimitives).toBe(0);
    for (let axis = 0; axis < 3; axis++) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = axis; i < mesh.triangles.length; i += 3) {
        lo = Math.min(lo, mesh.triangles[i]);
        hi = Math.max(hi, mesh.triangles[i]);
      }
      near(lo, expected.positionMin[axis], tol.metres);
      near(hi, expected.positionMax[axis], tol.metres);
    }
  });
});

describe('AC-EZD-303-1 heights and slope read from the fixture GLB match its expected JSON', () => {
  const reading = readCeiling(mesh);
  const ceiling = ceilingMesh(mesh);

  it('corner heights', () => {
    expect(reading).not.toBeNull();
    for (const key of ['SW', 'NW', 'SE', 'NE'] as const) {
      const want = expected.ceiling.cornerHeightsIn[key];
      near(reading!.cornerHeightsIn[key], want.heightIn, tol.inches);
      near(ceilingHeightAt(ceiling!, { x: want.at[0], y: want.at[1] }), want.heightIn, tol.inches);
    }
  });

  it('height at the room centre', () => {
    const c = expected.ceiling.centre;
    near(ceilingHeightAt(ceiling!, { x: c.at[0], y: c.at[1] }), c.heightIn, tol.inches);
  });

  it('height along the slope follows heightAtWest + x × rise / run', () => {
    const { heightAtWestIn, rise, run } = expected.ceiling;
    for (const x of [0, 18, 36, 100, 144]) {
      for (const y of [0, 30, 120]) {
        near(ceilingHeightAt(ceiling!, { x, y }), heightAtWestIn + (x * rise) / run, tol.inches);
      }
    }
  });

  it('low wall and high wall', () => {
    expect(reading!.lowWall?.side).toBe(expected.ceiling.lowWall.side);
    near(reading!.lowWall?.heightIn, expected.ceiling.lowWall.heightIn, tol.inches);
    expect(reading!.highWall?.side).toBe(expected.ceiling.highWall.side);
    near(reading!.highWall?.heightIn, expected.ceiling.highWall.heightIn, tol.inches);
  });

  it('pitch and slope', () => {
    near(reading!.pitchPer12, expected.ceiling.pitchPer12, tol.pitchPer12);
    near(reading!.slopeDeg, expected.ceiling.slopeDeg, tol.slopeDeg);
  });

  it('a point outside the room has no ceiling height', () => {
    expect(ceilingHeightAt(ceiling!, { x: -12, y: 60 })).toBeNull();
    expect(ceilingHeightAt(ceiling!, { x: 72, y: 132 })).toBeNull();
  });
});

describe('EZD-303 unreadable files', () => {
  it('refuses bytes that are not a GLB', () => {
    const err = (() => {
      try {
        readGlb(new TextEncoder().encode('0\nSECTION\n2\nHEADER\n0\nEOF\n'));
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(GlbReadError);
    expect((err as GlbReadError).code).toBe('not_glb');
  });

  it('refuses a GLB cut short', () => {
    const bytes = new Uint8Array(readFileSync(fixture(GLB)));
    expect(() => readGlb(bytes.subarray(0, 200))).toThrow(GlbReadError);
  });

  it('refuses glTF version 1', () => {
    const bytes = new Uint8Array(readFileSync(fixture(GLB)));
    new DataView(bytes.buffer, bytes.byteOffset).setUint32(4, 1, true);
    expect(() => readGlb(bytes)).toThrow(expect.objectContaining({ code: 'unsupported_glb_version' }));
  });
});

const realDir = fixture('fixtures/real/polycam-glb');
const realEntry = (
  JSON.parse(readFileSync(fixture('fixtures/manifest.json'), 'utf8')) as { id: string; status: string }[]
).find((e) => e.id === 'polycam-glb');
const realFiles =
  realEntry?.status === 'present' && existsSync(realDir)
    ? readdirSync(realDir).filter((f) => f.toLowerCase().endsWith('.glb'))
    : [];

// Runs once Josh supplies the real file (fixtures/manifest.json polycam-glb "not yet supplied").
it.skipIf(realFiles.length === 0)('EZD-303 the real Polycam GLB gives a ceiling reading', () => {
  for (const f of realFiles) {
    const r = readCeiling(readGlb(new Uint8Array(readFileSync(path.join(realDir, f)))));
    expect(r).not.toBeNull();
    expect(r!.maxHeightIn).toBeGreaterThan(0);
  }
});

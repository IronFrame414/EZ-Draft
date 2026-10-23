// EZD-030 spike tests T1-T13 (vault/plans/EZD-030.md, Tests).
// Fixtures W1 and W2, tolerances and every expected value come from the plan's Tests section
// (fixture inputs, Tolerances, Formulas for W1, Tests table). Lengths are decimal inches (03 Architecture rule 5).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { topHeightAt, wallFace } from './wall-face';
import type { WallInput } from './wall-face';
import { buildWallMesh } from './wall-mesh';

// ---------- Fixtures (plan Tests: Fixture inputs) ----------
const W1: WallInput = {
  length: 144,
  thickness: 4.5,
  ceiling: { heightAtStart: 96, rise: 4, run: 12 },
  openings: [
    { kind: 'door', offset: 12, width: 36, height: 80, sill: 0 },
    { kind: 'window', offset: 84, width: 36, height: 60, sill: 42 },
  ],
};
const W2: WallInput = { ...W1, ceiling: { heightAtStart: 144, rise: -4, run: 12 } };

// ---------- Tolerances (plan Tests: Tolerances) ----------
const TOL = 1 / 64; // 0.015625 in, 03 Architecture rule 5
const AREA_TOL = 0.5; // sq in
const VOLUME_TOL = 2.25; // cu in = 0.5 x 4.5
const T = 4.5; // fixture thickness

// ---------- Expected values (plan Tests: Formulas for W1) ----------
const topW1 = (x: number) => 96 + (x * 4) / 12;
const topW2 = (x: number) => 144 - (x * 4) / 12;
const NET_FACE_AREA = 144 * ((96 + 144) / 2) - 36 * 80 - 36 * 60; // 12,240
const SLOPED_TOP_LENGTH = 48 * Math.sqrt(10); // sqrt(144^2 + 48^2) = 151.7893

const DOOR = { x0: 12, x1: 48, y0: 0, y1: 80 };
const WINDOW = { x0: 84, x1: 120, y0: 42, y1: 102 };
const OPENING_CORNERS: Array<[number, number]> = [
  [12, 0],
  [48, 0],
  [48, 80],
  [12, 80],
  [84, 42],
  [120, 42],
  [120, 102],
  [84, 102],
];
const WALL_CORNERS: Array<[number, number]> = [
  [0, 0],
  [144, 0],
  [144, 144],
  [0, 96],
];

// ---------- Mesh reading (plan Tests: Mesh reading) ----------
type V3 = [number, number, number];
type Tri = [V3, V3, V3];
type Mesh = ReturnType<typeof buildWallMesh>;

function vertices(g: Mesh): V3[] {
  const pos = g.getAttribute('position');
  const out: V3[] = [];
  for (let i = 0; i < pos.count; i++) out.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
  return out;
}

function triangles(g: Mesh): Tri[] {
  const pos = g.getAttribute('position');
  const index = g.getIndex();
  const n = index ? index.count : pos.count;
  const at = (k: number): V3 => {
    const i = index ? index.getX(k) : k;
    return [pos.getX(i), pos.getY(i), pos.getZ(i)];
  };
  const out: Tri[] = [];
  for (let k = 0; k + 2 < n; k += 3) out.push([at(k), at(k + 1), at(k + 2)]);
  return out;
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.sqrt(dot(a, a));
const triArea = (t: Tri) => len(cross(sub(t[1], t[0]), sub(t[2], t[0]))) / 2;
const sumArea = (ts: Tri[]) => ts.reduce((s, t) => s + triArea(t), 0);

const near = (a: number, b: number, tol = TOL) => Math.abs(a - b) <= tol;
const dist2 = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const dist3 = (a: V3, b: V3) => len(sub(a, b));

// A triangle "lies on plane P" when all three vertices are within 1/64 in of P.
const onAxisPlane = (t: Tri, axis: 0 | 1 | 2, value: number) => t.every((v) => near(v[axis], value));
// Plane y = h0 + k x (all z): perpendicular distance |y - h0 - k x| / sqrt(1 + k^2).
const onSlopePlane = (t: Tri, h0: number, k: number) =>
  t.every((v) => Math.abs(v[1] - h0 - k * v[0]) / Math.sqrt(1 + k * k) <= TOL);
const within = (v: number, lo: number, hi: number) => v >= lo - TOL && v <= hi + TOL;

// Point coverage in (x, y) against a triangle, edges included; zero-area triangles cover nothing.
function covers(t: Tri, p: [number, number]): boolean {
  const [a, b, c] = t;
  const d = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  if (Math.abs(d) < 1e-9) return false;
  const s1 = ((b[0] - a[0]) * (p[1] - a[1]) - (p[0] - a[0]) * (b[1] - a[1])) / d;
  const s2 = ((c[0] - b[0]) * (p[1] - b[1]) - (p[0] - b[0]) * (c[1] - b[1])) / d;
  const s3 = ((a[0] - c[0]) * (p[1] - c[1]) - (p[0] - c[0]) * (a[1] - c[1])) / d;
  const eps = 1e-9;
  return s1 >= -eps && s2 >= -eps && s3 >= -eps;
}

function shoelace(points: Array<[number, number]>): number {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

function grid5(r: { x0: number; x1: number; y0: number; y1: number }): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const xa = r.x0 + TOL;
  const xb = r.x1 - TOL;
  const ya = r.y0 + TOL;
  const yb = r.y1 - TOL;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      pts.push([xa + ((xb - xa) * i) / 4, ya + ((yb - ya) * j) / 4]);
    }
  }
  return pts;
}

// ---------- Source scanning (T4, T13) ----------
const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const SPIKE_DIR = dirname(SRC_DIR);

function importSpecifiers(source: string): string[] {
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  const out: string[] = [];
  for (const re of patterns) for (const m of source.matchAll(re)) out.push(m[1]);
  return out;
}

// Removes comments and string / template literal contents, so the T4 name check reads code only
// (the plan's own contract has the string literal 'window' as an opening kind).
function codeOnly(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const n = source[i + 1];
    if (c === '/' && n === '/') {
      while (i < source.length && source[i] !== '\n') i++;
    } else if (c === '/' && n === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
    } else if (c === "'" || c === '"' || c === '`') {
      i++;
      while (i < source.length && source[i] !== c) i += source[i] === '\\' ? 2 : 1;
      i++;
      out += '""';
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p));
    else out.push(p);
  }
  return out;
}

// ---------- Mesh checks shared by T8, T11 ----------
function checkTopEdge(g: Mesh, top: (x: number) => number, atStart: number, atEnd: number) {
  const vs = vertices(g);
  const startYs = vs.filter((v) => near(v[0], 0)).map((v) => v[1]);
  const endYs = vs.filter((v) => near(v[0], 144)).map((v) => v[1]);
  expect(startYs.length).toBeGreaterThan(0);
  expect(endYs.length).toBeGreaterThan(0);
  expect(Math.abs(Math.max(...startYs) - atStart)).toBeLessThanOrEqual(TOL);
  expect(Math.abs(Math.max(...endYs) - atEnd)).toBeLessThanOrEqual(TOL);
  const above = vs.filter((v) => v[1] > top(v[0]) + TOL);
  expect(above).toEqual([]);
}

function checkClosedSolid(g: Mesh) {
  // Weld vertices within 1/64 in; skip zero-area triangles.
  const reps: V3[] = [];
  const idOf = (v: V3) => {
    for (let i = 0; i < reps.length; i++) if (dist3(reps[i], v) <= TOL) return i;
    reps.push(v);
    return reps.length - 1;
  };
  const edges = new Map<string, number>();
  let volume = 0;
  for (const t of triangles(g)) {
    if (triArea(t) < 1e-6) continue;
    const ids = t.map(idOf);
    if (ids[0] === ids[1] || ids[1] === ids[2] || ids[0] === ids[2]) continue;
    for (const [a, b] of [
      [ids[0], ids[1]],
      [ids[1], ids[2]],
      [ids[2], ids[0]],
    ]) {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
    volume += dot(t[0], cross(t[1], t[2])) / 6;
  }
  expect(edges.size).toBeGreaterThan(0);
  const bad = [...edges].filter(([, count]) => count !== 2);
  expect(bad).toEqual([]);
  expect(Math.abs(Math.abs(volume) - NET_FACE_AREA * T)).toBeLessThanOrEqual(VOLUME_TOL);
}

describe('EZD-030 wall openings and sloped ceiling spike', () => {
  it('T1 slope heights: 4:12 top height at both ends and mid-wall', () => {
    expect(Math.abs(topHeightAt(W1, 0) - 96)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(topHeightAt(W1, 72) - 120)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(topHeightAt(W1, 144) - 144)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(topHeightAt(W2, 0) - 144)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(topHeightAt(W2, 144) - 96)).toBeLessThanOrEqual(TOL);
  });

  it('T2 face outline area: outer minus holes = 12,240 sq in', () => {
    const face = wallFace(W1);
    const net =
      Math.abs(shoelace(face.outer)) -
      face.holes.reduce((s, h) => s + Math.abs(shoelace(h)), 0);
    expect(Math.abs(net - NET_FACE_AREA)).toBeLessThanOrEqual(AREA_TOL);
  });

  it('T3 face corners present and none above the sloped top', () => {
    const face = wallFace(W1);
    const points = [...face.outer, ...face.holes.flat()];
    for (const corner of [...WALL_CORNERS, ...OPENING_CORNERS]) {
      const found = points.some((p) => dist2(p, corner) <= TOL);
      expect(found, `corner (${corner[0]}, ${corner[1]})`).toBe(true);
    }
    const above = points.filter((p) => p[1] > topW1(p[0]) + TOL);
    expect(above).toEqual([]);
  });

  it('T4 wall-face.ts is geometry-package code: no package imports, no document, window or three', () => {
    const source = readFileSync(join(SRC_DIR, 'wall-face.ts'), 'utf8');
    const bare = importSpecifiers(source).filter((s) => !s.startsWith('.'));
    expect(bare).toEqual([]);
    const code = codeOnly(source);
    expect(code).not.toMatch(/\bdocument\b/);
    expect(code).not.toMatch(/\bwindow\b/);
    expect(code).not.toMatch(/\bthree\b/);
  });

  it('EZD-030 done when: T5 front and back faces each have the net face area 12,240 sq in', () => {
    const tris = triangles(buildWallMesh(W1));
    const front = tris.filter((t) => onAxisPlane(t, 2, 0));
    const back = tris.filter((t) => onAxisPlane(t, 2, T));
    expect(Math.abs(sumArea(front) - NET_FACE_AREA)).toBeLessThanOrEqual(AREA_TOL);
    expect(Math.abs(sumArea(back) - NET_FACE_AREA)).toBeLessThanOrEqual(AREA_TOL);
  });

  it('EZD-030 done when: T6 holes exactly at the door and window rectangles', () => {
    const g = buildWallMesh(W1);
    const tris = triangles(g);
    const verts = vertices(g);
    const outside: Array<[string, [number, number]]> = [
      ['door left', [DOOR.x0 - TOL, (DOOR.y0 + DOOR.y1) / 2]],
      ['door right', [DOOR.x1 + TOL, (DOOR.y0 + DOOR.y1) / 2]],
      ['door head', [(DOOR.x0 + DOOR.x1) / 2, DOOR.y1 + TOL]],
      ['window left', [WINDOW.x0 - TOL, (WINDOW.y0 + WINDOW.y1) / 2]],
      ['window right', [WINDOW.x1 + TOL, (WINDOW.y0 + WINDOW.y1) / 2]],
      ['window sill', [(WINDOW.x0 + WINDOW.x1) / 2, WINDOW.y0 - TOL]],
      ['window head', [(WINDOW.x0 + WINDOW.x1) / 2, WINDOW.y1 + TOL]],
    ];
    for (const z of [0, T]) {
      const face = tris.filter((t) => onAxisPlane(t, 2, z));
      // (a) no triangle covers any inset grid point inside either opening
      for (const [name, rect] of [
        ['door', DOOR],
        ['window', WINDOW],
      ] as const) {
        for (const p of grid5(rect)) {
          const hit = face.some((t) => covers(t, p));
          expect(hit, `z=${z} ${name} inside point (${p[0]}, ${p[1]})`).toBe(false);
        }
      }
      // (b) points just outside each opening edge midpoint are covered
      for (const [name, p] of outside) {
        const hit = face.some((t) => covers(t, p));
        expect(hit, `z=${z} ${name} outside point (${p[0]}, ${p[1]})`).toBe(true);
      }
      // (c) all 8 opening corners are mesh vertices on this face
      for (const [cx, cy] of OPENING_CORNERS) {
        const found = verts.some((v) => dist3(v, [cx, cy, z]) <= TOL);
        expect(found, `z=${z} corner (${cx}, ${cy})`).toBe(true);
      }
    }
  });

  it('T7 holes go through the wall: jamb, head and sill faces and no door sill', () => {
    const tris = triangles(buildWallMesh(W1));
    const jamb = (x: number, r: { y0: number; y1: number }) =>
      sumArea(tris.filter((t) => onAxisPlane(t, 0, x) && t.every((v) => within(v[1], r.y0, r.y1))));
    const level = (y: number, r: { x0: number; x1: number }) =>
      sumArea(tris.filter((t) => onAxisPlane(t, 1, y) && t.every((v) => within(v[0], r.x0, r.x1))));
    expect(Math.abs(jamb(12, DOOR) - 80 * T)).toBeLessThanOrEqual(AREA_TOL);
    expect(Math.abs(jamb(48, DOOR) - 80 * T)).toBeLessThanOrEqual(AREA_TOL);
    expect(Math.abs(level(80, DOOR) - 36 * T)).toBeLessThanOrEqual(AREA_TOL);
    expect(Math.abs(jamb(84, WINDOW) - 60 * T)).toBeLessThanOrEqual(AREA_TOL);
    expect(Math.abs(jamb(120, WINDOW) - 60 * T)).toBeLessThanOrEqual(AREA_TOL);
    expect(Math.abs(level(42, WINDOW) - 36 * T)).toBeLessThanOrEqual(AREA_TOL);
    expect(Math.abs(level(102, WINDOW) - 36 * T)).toBeLessThanOrEqual(AREA_TOL);
    const doorSill = tris.filter(
      (t) => onAxisPlane(t, 1, 0) && t.some((v) => v[0] > DOOR.x0 + TOL && v[0] < DOOR.x1 - TOL),
    );
    expect(doorSill).toEqual([]);
  });

  it('EZD-030 done when: T8 top edge matches the 4:12 slope at both ends', () => {
    const g1 = buildWallMesh(W1);
    checkTopEdge(g1, topW1, 96, 144);
    const v1 = vertices(g1);
    for (const p of [
      [0, 96, 0],
      [0, 96, T],
      [144, 144, 0],
      [144, 144, T],
    ] as V3[]) {
      const found = v1.some((v) => dist3(v, p) <= TOL);
      expect(found, `W1 vertex (${p.join(', ')})`).toBe(true);
    }
    checkTopEdge(buildWallMesh(W2), topW2, 144, 96);
  });

  it('T9 sloped top face area = 4.5 x 48 sqrt(10) sq in', () => {
    const tris = triangles(buildWallMesh(W1));
    const top = tris.filter((t) => onSlopePlane(t, 96, 4 / 12));
    expect(Math.abs(sumArea(top) - T * SLOPED_TOP_LENGTH)).toBeLessThanOrEqual(AREA_TOL);
  });

  it('T10 end and floor faces, and the listed faces account for the whole mesh', () => {
    const tris = triangles(buildWallMesh(W1));
    const on = (axis: 0 | 1 | 2, value: number) => sumArea(tris.filter((t) => onAxisPlane(t, axis, value)));
    const endStart = on(0, 0);
    const endEnd = on(0, 144);
    const floor = on(1, 0);
    expect(Math.abs(endStart - 96 * T)).toBeLessThanOrEqual(AREA_TOL);
    expect(Math.abs(endEnd - 144 * T)).toBeLessThanOrEqual(AREA_TOL);
    expect(Math.abs(floor - (144 - 36) * T)).toBeLessThanOrEqual(AREA_TOL);

    const jamb = (x: number, r: { y0: number; y1: number }) =>
      sumArea(tris.filter((t) => onAxisPlane(t, 0, x) && t.every((v) => within(v[1], r.y0, r.y1))));
    const level = (y: number, r: { x0: number; x1: number }) =>
      sumArea(tris.filter((t) => onAxisPlane(t, 1, y) && t.every((v) => within(v[0], r.x0, r.x1))));
    const listed =
      on(2, 0) +
      on(2, T) +
      jamb(12, DOOR) +
      jamb(48, DOOR) +
      level(80, DOOR) +
      jamb(84, WINDOW) +
      jamb(120, WINDOW) +
      level(42, WINDOW) +
      level(102, WINDOW) +
      sumArea(tris.filter((t) => onSlopePlane(t, 96, 4 / 12))) +
      endStart +
      endEnd +
      floor;
    const total = sumArea(tris);
    const expectedTotal =
      2 * NET_FACE_AREA +
      2 * 80 * T +
      36 * T +
      2 * 60 * T +
      2 * 36 * T +
      T * SLOPED_TOP_LENGTH +
      96 * T +
      144 * T +
      (144 - 36) * T; // 28,475.05
    expect(Math.abs(total - expectedTotal)).toBeLessThanOrEqual(AREA_TOL);
    expect(Math.abs(listed - total)).toBeLessThanOrEqual(AREA_TOL);
  });

  it('T11 closed solid: every edge shared by two triangles, volume = net face area x thickness', () => {
    checkClosedSolid(buildWallMesh(W1));
    checkClosedSolid(buildWallMesh(W2));
  });

  it('T12 bounds: (0, 0, 0) to (144, 144, 4.5)', () => {
    const g = buildWallMesh(W1);
    g.computeBoundingBox();
    const box = g.boundingBox;
    expect(box).not.toBeNull();
    const { min, max } = box!;
    expect(Math.abs(min.x - 0)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(min.y - 0)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(min.z - 0)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(max.x - 144)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(max.y - 144)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(max.z - T)).toBeLessThanOrEqual(TOL);
  });

  it('T13 no CSG library: dependencies and imports, three only in wall-mesh', () => {
    const pkg = JSON.parse(readFileSync(join(SPIKE_DIR, 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    const depFields = [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ];
    const names: string[] = [];
    for (const field of depFields) {
      const deps = pkg[field];
      if (deps && typeof deps === 'object') names.push(...Object.keys(deps));
    }
    for (const field of ['bundledDependencies', 'bundleDependencies']) {
      const deps = pkg[field];
      if (Array.isArray(deps)) names.push(...deps.map(String));
    }
    expect(names.filter((n) => /csg|manifold/i.test(n))).toEqual([]);

    const allowedThree = new Set(['wall-mesh.ts', 'wall-mesh.bench.ts']);
    const files = filesUnder(SRC_DIR).filter((f) => !/\.test\.tsx?$/.test(f));
    for (const file of files) {
      const rel = relative(SRC_DIR, file).split(sep).join('/');
      const specs = importSpecifiers(readFileSync(file, 'utf8'));
      expect(specs.filter((s) => /csg|manifold/i.test(s)), rel).toEqual([]);
      const threeImports = specs.filter((s) => s === 'three' || s.startsWith('three/'));
      if (!allowedThree.has(rel)) expect(threeImports, rel).toEqual([]);
    }
  });
});

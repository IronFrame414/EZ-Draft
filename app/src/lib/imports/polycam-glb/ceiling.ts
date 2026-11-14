// EZD-303 (phase-03 EZD-303 "read ceiling heights and slope from it"; S02 Decisions "heights at points (low/high
// wall), pitch, or the value read from the mesh"; W6 step 2 "typed at points, by pitch, or read from the mesh"):
// reads ceiling heights and slope from a GLB mesh. The mesh is reference only and never becomes model data (08).
//
// Plan mapping (vault/build/assumptions.md EZD-303): glTF metres, +Y up (Khronos glTF 2.0); plan x = X, plan y
// (north) = -Z, height = Y above the floor, all ÷ 0.0254 to inches (03 rule 5). Ceiling triangles are those whose
// counter-clockwise (glTF front face) normal points down (y < -0.5, within 60° of straight down); the floor
// level is the lowest point of the triangles facing up (y > 0.5), or the lowest point of the mesh if none do.
// Pitch and slope come from a least-squares plane through the ceiling vertices: pitch = 12 × rise per run (S05
// writes pitch as n/12), slope = atan(rise per run).
import type { GlbMesh } from './read-glb';

export const METRES_PER_INCH = 0.0254;
const CEILING_NORMAL_Y = -0.5;
const FLOOR_NORMAL_Y = 0.5;
const FLAT = 1e-6; // rise per run below which the ceiling is flat
const EDGE = 1e-6; // barycentric slack so points on shared edges and room corners are covered

export type PlanPoint = { x: number; y: number };
export type WallSide = 'N' | 'E' | 'S' | 'W';

/** Ceiling triangles in plan inches: x, y, height above the floor, 9 numbers per triangle. */
export type CeilingMesh = { triangles: Float64Array; triangleCount: number };

export type CeilingReading = {
  /** Plan extent of the ceiling, inches. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** Heights at the corners of the extent, inches; null where no ceiling triangle covers the point. */
  cornerHeightsIn: Record<'SW' | 'NW' | 'SE' | 'NE', number | null>;
  minHeightIn: number;
  maxHeightIn: number;
  /** Null when the ceiling is flat. */
  lowWall: { side: WallSide; heightIn: number } | null;
  highWall: { side: WallSide; heightIn: number } | null;
  pitchPer12: number;
  slopeDeg: number;
};

/** The mesh's ceiling in plan inches, or null when the mesh has no downward-facing surface. */
export function ceilingMesh(mesh: GlbMesh): CeilingMesh | null {
  const t = mesh.triangles;
  let floorY = Infinity;
  let lowest = Infinity;
  const ceiling: number[] = [];
  for (let i = 0; i < mesh.triangleCount; i++) {
    const o = i * 9;
    const ux = t[o + 3] - t[o];
    const uy = t[o + 4] - t[o + 1];
    const uz = t[o + 5] - t[o + 2];
    const vx = t[o + 6] - t[o];
    const vy = t[o + 7] - t[o + 1];
    const vz = t[o + 8] - t[o + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    const minY = Math.min(t[o + 1], t[o + 4], t[o + 7]);
    lowest = Math.min(lowest, minY);
    if (len === 0) continue;
    const dy = ny / len;
    if (dy > FLOOR_NORMAL_Y) floorY = Math.min(floorY, minY);
    if (dy < CEILING_NORMAL_Y) ceiling.push(i);
  }
  if (ceiling.length === 0) return null;
  const base = Number.isFinite(floorY) ? floorY : lowest;
  const out = new Float64Array(ceiling.length * 9);
  ceiling.forEach((tri, j) => {
    for (let k = 0; k < 3; k++) {
      const o = tri * 9 + k * 3;
      out[j * 9 + k * 3] = t[o] / METRES_PER_INCH;
      out[j * 9 + k * 3 + 1] = -t[o + 2] / METRES_PER_INCH;
      out[j * 9 + k * 3 + 2] = (t[o + 1] - base) / METRES_PER_INCH;
    }
  });
  return { triangles: out, triangleCount: ceiling.length };
}

/** Ceiling height above the floor at a plan point, inches; the lowest covering surface wins; null if none. */
export function ceilingHeightAt(c: CeilingMesh, p: PlanPoint): number | null {
  const t = c.triangles;
  let best: number | null = null;
  for (let i = 0; i < c.triangleCount; i++) {
    const o = i * 9;
    const [ax, ay, ah, bx, by, bh, cx, cy, ch] = t.subarray(o, o + 9);
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(d) < 1e-12) continue; // vertical sliver, no plan area
    const l1 = ((by - cy) * (p.x - cx) + (cx - bx) * (p.y - cy)) / d;
    const l2 = ((cy - ay) * (p.x - cx) + (ax - cx) * (p.y - cy)) / d;
    const l3 = 1 - l1 - l2;
    if (l1 < -EDGE || l2 < -EDGE || l3 < -EDGE) continue;
    const h = l1 * ah + l2 * bh + l3 * ch;
    if (best === null || h < best) best = h;
  }
  return best;
}

/** Heights, low and high wall, pitch and slope of the mesh's ceiling; null when the mesh has no ceiling. */
export function readCeiling(mesh: GlbMesh): CeilingReading | null {
  const c = ceilingMesh(mesh);
  if (!c) return null;
  const t = c.triangles;
  const n = c.triangleCount * 3;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minH = Infinity;
  let maxH = -Infinity;
  let mx = 0;
  let my = 0;
  let mh = 0;
  for (let i = 0; i < n; i++) {
    const [x, y, h] = [t[i * 3], t[i * 3 + 1], t[i * 3 + 2]];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minH = Math.min(minH, h);
    maxH = Math.max(maxH, h);
    mx += x / n;
    my += y / n;
    mh += h / n;
  }
  // Least-squares plane h = mh + gx (x - mx) + gy (y - my), on centred coordinates.
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  let sxh = 0;
  let syh = 0;
  for (let i = 0; i < n; i++) {
    const x = t[i * 3] - mx;
    const y = t[i * 3 + 1] - my;
    const h = t[i * 3 + 2] - mh;
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
    sxh += x * h;
    syh += y * h;
  }
  const det = sxx * syy - sxy * sxy;
  const gx = det === 0 ? 0 : (sxh * syy - syh * sxy) / det;
  const gy = det === 0 ? 0 : (syh * sxx - sxh * sxy) / det;
  const rise = Math.hypot(gx, gy);
  const flat = rise < FLAT;
  // The low wall is on the downhill side, the high wall opposite it.
  const [low, high]: [WallSide, WallSide] =
    Math.abs(gx) >= Math.abs(gy) ? (gx > 0 ? ['W', 'E'] : ['E', 'W']) : gy > 0 ? ['S', 'N'] : ['N', 'S'];

  return {
    bounds: { minX, maxX, minY, maxY },
    cornerHeightsIn: {
      SW: ceilingHeightAt(c, { x: minX, y: minY }),
      NW: ceilingHeightAt(c, { x: minX, y: maxY }),
      SE: ceilingHeightAt(c, { x: maxX, y: minY }),
      NE: ceilingHeightAt(c, { x: maxX, y: maxY }),
    },
    minHeightIn: minH,
    maxHeightIn: maxH,
    lowWall: flat ? null : { side: low, heightIn: minH },
    highWall: flat ? null : { side: high, heightIn: maxH },
    pitchPer12: flat ? 0 : 12 * rise,
    slopeDeg: flat ? 0 : (Math.atan(rise) * 180) / Math.PI,
  };
}

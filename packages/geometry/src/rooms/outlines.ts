// EZD-205a Build step 5 (vault/plans/EZD-205a.md section 3 `findRoomOutlines`, Decided "Outline graph", "Faces",
// "Face line", "Ring vertices", "Room rings", "Walls not dividing a room", "Outline order", "wallIds", "Wall status",
// "Speed"; Q-0559; Q-0569 (b); Q-0570; Q-0598 (a); 03g): room outlines on the walls' inside finished faces. The
// walls of one level make a planar graph; each bounded face is a room, outlined on the face lines of its walls.
import type { Point } from '../schema';
import { COMPARISON_TOLERANCE_IN, pointsEqual } from '../tolerance';
import { findWallJoins } from '../walls/joins';
import { wallFaceLines, wallLength, type WallLine, type WallObject } from '../walls/wall';
import { outlineAreaSqIn, pointInRing, ringSignedAreaSqIn } from './area';

export type RoomOutline = { boundary: Point[]; wallIds: string[] };

// One direction of a graph edge. `forward` = it runs start to end of its wall.
type HalfEdge = { from: number; to: number; wall: number; forward: boolean };

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const copy = (p: Point): Point => ({ x: p.x, y: p.y });

// The intersection of the two drawn lines (the caller knows they cross).
function lineIntersection(a: WallLine, b: WallLine): Point {
  const dA = sub(a.end, a.start);
  const dB = sub(b.end, b.start);
  const t = cross(sub(b.start, a.start), dB) / cross(dA, dB);
  return { x: a.start.x + dA.x * t, y: a.start.y + dA.y * t };
}

function project(p: Point, line: WallLine): Point {
  const d = sub(line.end, line.start);
  const t = dot(sub(p, line.start), d) / dot(d, d);
  return { x: line.start.x + d.x * t, y: line.start.y + d.y * t };
}

function distanceToLine(p: Point, a: Point, b: Point): number {
  const d = sub(b, a);
  const len = Math.hypot(d.x, d.y);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(cross(d, sub(p, a))) / len;
}

// Drops consecutive equal points (wrapping), then, repeatedly, a point on the straight run between its neighbours.
function cleanRing(points: Point[]): Point[] {
  const r: Point[] = [];
  for (const p of points) {
    if (r.length === 0 || !pointsEqual(r[r.length - 1]!, p)) r.push(p);
  }
  while (r.length > 1 && pointsEqual(r[r.length - 1]!, r[0]!)) r.pop();
  let changed = true;
  while (changed && r.length >= 3) {
    changed = false;
    for (let i = 0; i < r.length && r.length >= 3; i++) {
      const prev = r[(i - 1 + r.length) % r.length]!;
      const cur = r[i]!;
      const next = r[(i + 1) % r.length]!;
      if (
        distanceToLine(cur, prev, next) <= COMPARISON_TOLERANCE_IN &&
        dot(sub(cur, prev), sub(next, cur)) > 0
      ) {
        r.splice(i, 1);
        changed = true;
        i--;
      }
    }
  }
  return r;
}

// Starts the ring at its vertex with the smallest y, then the smallest x.
function rotateToLowest(r: Point[]): Point[] {
  let k = 0;
  for (let i = 1; i < r.length; i++) {
    const p = r[i]!;
    const b = r[k]!;
    if (p.y < b.y || (p.y === b.y && p.x < b.x)) k = i;
  }
  return [...r.slice(k), ...r.slice(0, k)];
}

// Joins one hole (clockwise ring) into the ring as a keyhole from the hole's vertex `m`; null when the ray +x from
// `M` meets no edge.
function joinHole(ring: Point[], hole: Point[], m: number): Point[] | null {
  const M = hole[m]!;
  let best = -1;
  let bestX = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    if (a.y > M.y === b.y > M.y) continue;
    const x = a.x + ((M.y - a.y) * (b.x - a.x)) / (b.y - a.y);
    if (x > M.x && x < bestX) {
      bestX = x;
      best = i;
    }
  }
  if (best < 0) return null;
  const ri = ring[best]!;
  const rj = ring[(best + 1) % ring.length]!;
  const I: Point = { x: bestX, y: M.y };
  const holeRun: Point[] = [];
  for (let k = 1; k < hole.length; k++) holeRun.push(copy(hole[(m + k) % hole.length]!));
  const loop = [copy(M), ...holeRun, copy(M)];
  let spliced: Point[];
  if (pointsEqual(I, ri)) spliced = [...loop, copy(ri)];
  else if (pointsEqual(I, rj)) spliced = [copy(rj), ...loop];
  else spliced = [I, ...loop, copy(I)];
  return [...ring.slice(0, best + 1), ...spliced, ...ring.slice(best + 1)];
}

export function findRoomOutlines(walls: readonly WallObject[], level: string): RoomOutline[] {
  const lvl = level.toLowerCase();
  const levelWalls = walls.filter(
    (w) =>
      w.data.level.toLowerCase() === lvl && wallLength(w.data.geometry) > COMPARISON_TOLERANCE_IN,
  );
  if (levelWalls.length === 0) return [];

  // Vertices: wall ends and join points; points within 1/64" share one vertex (first seen wins).
  const vertices: Point[] = [];
  const vertexOf = (p: Point): number => {
    const found = vertices.findIndex((v) => pointsEqual(v, p));
    if (found >= 0) return found;
    vertices.push(copy(p));
    return vertices.length - 1;
  };
  const byId = new Map(levelWalls.map((w) => [w.id, w]));
  const onWall: number[][] = levelWalls.map((w) => {
    const line = w.data.geometry;
    const ids = [vertexOf(line.start), vertexOf(line.end)];
    for (const j of findWallJoins(levelWalls, w.id)) {
      const other = byId.get(j.otherId);
      if (other === undefined) continue;
      if (j.kind === 'tee-on') ids.push(vertexOf(other.data.geometry[j.otherEnd]));
      else if (j.kind === 'cross') ids.push(vertexOf(lineIntersection(line, other.data.geometry)));
    }
    return ids;
  });

  // Edges: each wall cut at its vertices in order along it; an edge already made by an earlier wall is dropped.
  const halfEdges: HalfEdge[] = [];
  const edgeKeys = new Set<string>();
  levelWalls.forEach((w, wi) => {
    const { start, end } = w.data.geometry;
    const d = sub(end, start);
    const unique = [...new Set(onWall[wi]!)];
    const along = (v: number) => dot(sub(vertices[v]!, start), d);
    unique.sort((a, b) => along(a) - along(b));
    for (let k = 0; k + 1 < unique.length; k++) {
      const u = unique[k]!;
      const v = unique[k + 1]!;
      const key = u < v ? `${u},${v}` : `${v},${u}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      halfEdges.push({ from: u, to: v, wall: wi, forward: true });
      halfEdges.push({ from: v, to: u, wall: wi, forward: false });
    }
  });
  if (halfEdges.length === 0) return [];

  // Outgoing half-edges at each vertex by angle, ascending.
  const angle = (h: HalfEdge) => {
    const a = vertices[h.from]!;
    const b = vertices[h.to]!;
    return Math.atan2(b.y - a.y, b.x - a.x);
  };
  const outgoing: number[][] = vertices.map(() => []);
  halfEdges.forEach((h, i) => outgoing[h.from]!.push(i));
  for (const list of outgoing) list.sort((a, b) => angle(halfEdges[a]!) - angle(halfEdges[b]!));
  const position = new Map<number, number>();
  for (const list of outgoing) list.forEach((h, k) => position.set(h, k));
  const next = (h: number): number => {
    const list = outgoing[halfEdges[h]!.to]!;
    const twin = h ^ 1;
    const k = position.get(twin)!;
    return list[(k - 1 + list.length) % list.length]!;
  };

  // Connected components (by vertex).
  const parent = vertices.map((_, i) => i);
  const findRoot = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  for (const h of halfEdges) parent[findRoot(h.from)] = findRoot(h.to);
  const componentOf = (h: number) => findRoot(halfEdges[h]!.from);

  // Faces: the cycles of `next`.
  const cycles: number[][] = [];
  const seen = new Set<number>();
  for (let h = 0; h < halfEdges.length; h++) {
    if (seen.has(h)) continue;
    const cycle: number[] = [];
    let c = h;
    while (!seen.has(c)) {
      seen.add(c);
      cycle.push(c);
      c = next(c);
    }
    cycles.push(cycle);
  }

  // Face line of a half-edge, oriented along it; the face is on its left.
  const faces = levelWalls.map((w) => wallFaceLines(w.data));
  const faceLine = (h: HalfEdge): WallLine => {
    const f = faces[h.wall]!;
    return h.forward ? f.left : { start: f.right.end, end: f.right.start };
  };
  const ringOf = (cycle: number[]): Point[] => {
    const points: Point[] = [];
    for (let i = 0; i < cycle.length; i++) {
      const ha = halfEdges[cycle[i]!]!;
      const hb = halfEdges[cycle[(i + 1) % cycle.length]!]!;
      const a = faceLine(ha);
      const b = faceLine(hb);
      const dA = sub(a.end, a.start);
      const dB = sub(b.end, b.start);
      const den = cross(dA, dB);
      if (Math.abs(den) > 1e-12 * Math.hypot(dA.x, dA.y) * Math.hypot(dB.x, dB.y)) {
        const t = cross(sub(b.start, a.start), dB) / den;
        points.push({ x: a.start.x + dA.x * t, y: a.start.y + dA.y * t });
      } else {
        const V = vertices[ha.to]!;
        const pa = project(V, a);
        const pb = project(V, b);
        points.push(pa);
        if (!pointsEqual(pa, pb)) points.push(pb);
      }
    }
    return cleanRing(points);
  };
  const drawnArea = (cycle: number[]) =>
    ringSignedAreaSqIn(cycle.map((h) => vertices[halfEdges[h]!.from]!));

  type Room = { ring: Point[]; component: number; cycles: number[][]; holes: Point[][] };
  const rooms: Room[] = [];
  const outerByComponent = new Map<number, number[]>();
  for (const cycle of cycles) {
    if (drawnArea(cycle) > 0) {
      const ring = ringOf(cycle);
      if (ring.length >= 3 && ringSignedAreaSqIn(ring) > 0)
        rooms.push({
          ring: rotateToLowest(ring),
          component: componentOf(cycle[0]!),
          cycles: [cycle],
          holes: [],
        });
    } else {
      const comp = componentOf(cycle[0]!);
      if (!outerByComponent.has(comp)) outerByComponent.set(comp, cycle);
    }
  }

  // Holes: a component's outer face inside the smallest room of another component.
  const firstHalfEdge = new Map<number, number>();
  for (let h = halfEdges.length - 1; h >= 0; h--) firstHalfEdge.set(componentOf(h), h);
  for (const [comp, cycle] of outerByComponent) {
    const ring = ringOf(cycle);
    if (ring.length < 3 || !(ringSignedAreaSqIn(ring) < 0)) continue;
    const at = vertices[halfEdges[firstHalfEdge.get(comp)!]!.from]!;
    let host: Room | null = null;
    for (const room of rooms) {
      if (room.component === comp || !pointInRing(at, room.ring)) continue;
      if (host === null || outlineAreaSqIn(room.ring) < outlineAreaSqIn(host.ring)) host = room;
    }
    if (host === null) continue;
    host.holes.push(ring);
    host.cycles.push(cycle);
  }

  const outlines: RoomOutline[] = rooms.map((room) => {
    const withM = room.holes.map((hole) => {
      let m = 0;
      for (let k = 1; k < hole.length; k++) {
        const p = hole[k]!;
        const b = hole[m]!;
        if (p.x > b.x || (p.x === b.x && p.y < b.y)) m = k;
      }
      return { hole, m };
    });
    withM.sort((a, b) => {
      const pa = a.hole[a.m]!;
      const pb = b.hole[b.m]!;
      return pb.x - pa.x || pa.y - pb.y;
    });
    let boundary = room.ring.map(copy);
    for (const { hole, m } of withM) boundary = joinHole(boundary, hole, m) ?? boundary;
    const used = new Set<number>();
    for (const cycle of room.cycles) for (const h of cycle) used.add(halfEdges[h]!.wall);
    const usedWalls = new Set([...used].map((wi) => levelWalls[wi]!));
    const wallIds = walls.filter((w) => usedWalls.has(w)).map((w) => w.id);
    return { boundary, wallIds };
  });

  return outlines.sort(
    (a, b) =>
      a.boundary[0]!.y - b.boundary[0]!.y ||
      a.boundary[0]!.x - b.boundary[0]!.x ||
      outlineAreaSqIn(a.boundary) - outlineAreaSqIn(b.boundary),
  );
}

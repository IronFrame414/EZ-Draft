// EZD-205b Build step 3 (vault/plans/EZD-205b.md section 3 `absorbGap`, Decided "Absorb steps", "Absorb change";
// 09j Absorbing; 09e; Q-0570; P203 `wallLengthProblem`, `moveWall`): a gap is absorbed by a wall of its chain that
// runs along it; the walls after it move by the gap. Reads and returns only wall objects; never mutates its input.
import type { ModelObject, Point } from '../schema';
import { findWallJoins, type WallEnd, type WallJoin } from '../walls/joins';
import { wallLength, wallLengthProblem, type WallLine, type WallObject } from '../walls/wall';
import { findClosures, type GapReport } from './closure';

export type AbsorbResult =
  | { ok: true; changed: WallObject[] }
  | {
      ok: false;
      reason:
        | 'no_gap'
        | 'wall_not_found'
        | 'not_in_chain'
        | 'across_gap'
        | 'zero_length'
        | 'too_long'
        | 'join_lost';
      wallId: string;
    };

const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const isWall = (o: ModelObject): o is WallObject => o.type === 'wall';

const add = (p: Point, d: Point): Point => ({ x: p.x + d.x, y: p.y + d.y });

const otherEndOf = (e: WallEnd): WallEnd => (e === 'start' ? 'end' : 'start');

// The `gap` report of the chain named by `gapWallIds` (a lower-case set), on the level of `gapWallIds[0]`.
function findGapReport(
  objects: readonly ModelObject[],
  gapWallIds: readonly string[],
): { report: GapReport; level: string } | null {
  if (gapWallIds.length === 0) return null;
  const walls = objects.filter(isWall);
  const firstWall = walls.find((w) => sameId(w.id, gapWallIds[0]!));
  if (firstWall === undefined) return null;
  const want = new Set(gapWallIds.map((id) => id.toLowerCase()));
  const level = firstWall.data.level;
  for (const r of findClosures(walls, level)) {
    if (r.kind !== 'gap') continue;
    const got = new Set(r.wallIds.map((id) => id.toLowerCase()));
    if (got.size === want.size && [...want].every((id) => got.has(id))) return { report: r, level };
  }
  return null;
}

function sameJoin(a: WallJoin, b: WallJoin): boolean {
  if (a.kind !== b.kind || !sameId(a.otherId, b.otherId)) return false;
  if (a.kind === 'corner' && b.kind === 'corner')
    return a.end === b.end && a.otherEnd === b.otherEnd;
  if (a.kind === 'tee-on' && b.kind === 'tee-on') return a.otherEnd === b.otherEnd;
  if (a.kind === 'tee-into' && b.kind === 'tee-into') return a.end === b.end;
  return true;
}

export function absorbGap(
  objects: readonly ModelObject[],
  gapWallIds: readonly string[],
  wallId: string,
): AbsorbResult {
  // (1) The gap report.
  const found = findGapReport(objects, gapWallIds);
  if (found === null) return { ok: false, reason: 'no_gap', wallId };
  const { report, level } = found;
  // (2) to (4) The picked wall.
  const picked = objects.find((o): o is WallObject => isWall(o) && sameId(o.id, wallId));
  if (picked === undefined) return { ok: false, reason: 'wall_not_found', wallId };
  const pos = report.wallIds.findIndex((id) => sameId(id, picked.id));
  if (pos < 0) return { ok: false, reason: 'not_in_chain', wallId };
  if (!report.parallelWallIds.some((id) => sameId(id, picked.id)))
    return { ok: false, reason: 'across_gap', wallId };

  // (5) The change.
  const lvl = level.toLowerCase();
  const walls = objects.filter(
    (o): o is WallObject => isWall(o) && o.data.level.toLowerCase() === lvl,
  );
  const byId = (id: string) => walls.find((w) => sameId(w.id, id))!;
  const chainWalls = report.wallIds.map(byId);
  const gap = report.gap;

  // The picked wall's walk-later end: the corner it shares with the next chain wall, or for the last wall the end
  // away from the previous one.
  let leave: WallEnd;
  if (pos < chainWalls.length - 1) {
    const next = chainWalls[pos + 1]!;
    const j = findWallJoins(walls, picked.id).find(
      (x) => x.kind === 'corner' && sameId(x.otherId, next.id),
    ) as Extract<WallJoin, { kind: 'corner' }>;
    leave = j.end;
  } else {
    const prev = chainWalls[pos - 1]!;
    const j = findWallJoins(walls, picked.id).find(
      (x) => x.kind === 'corner' && sameId(x.otherId, prev.id),
    ) as Extract<WallJoin, { kind: 'corner' }>;
    leave = otherEndOf(j.end);
  }

  const lines = new Map<WallObject, WallLine>();
  const lineOf = (w: WallObject): WallLine => lines.get(w) ?? w.data.geometry;
  const pg = picked.data.geometry;
  lines.set(picked, { ...pg, [leave]: add(pg[leave], gap) });
  const movedAfter = chainWalls.slice(pos + 1);
  for (const w of movedAfter) {
    const g = w.data.geometry;
    lines.set(w, { start: add(g.start, gap), end: add(g.end, gap) });
  }
  const inChain = new Set(chainWalls);
  const outside = new Set<WallObject>();
  for (const m of movedAfter) {
    for (const j of findWallJoins(walls, m.id)) {
      if (j.kind !== 'tee-on') continue;
      const other = byId(j.otherId);
      if (inChain.has(other)) continue;
      const current = lineOf(other);
      lines.set(other, { ...current, [j.otherEnd]: add(other.data.geometry[j.otherEnd], gap) });
      outside.add(other);
    }
  }
  const changedWalls = [...chainWalls.slice(pos), ...walls.filter((w) => outside.has(w))];

  for (const w of changedWalls) {
    const problem = wallLengthProblem(wallLength(lineOf(w)));
    if (problem !== null) return { ok: false, reason: problem, wallId: w.id };
  }

  const changed: WallObject[] = changedWalls.map((w) => {
    const line = lineOf(w);
    return {
      id: w.id,
      type: 'wall',
      data: {
        ...w.data,
        geometry: {
          start: { x: line.start.x, y: line.start.y },
          end: { x: line.end.x, y: line.end.y },
        },
      },
    };
  });

  // (6) No join is lost.
  const changedOf = new Map(changedWalls.map((w, i) => [w, changed[i]!]));
  const after = walls.map((w) => changedOf.get(w) ?? w);
  for (const w of changedWalls) {
    const now = findWallJoins(after, w.id);
    for (const j of findWallJoins(walls, w.id)) {
      if (!now.some((n) => sameJoin(j, n))) return { ok: false, reason: 'join_lost', wallId: w.id };
    }
  }

  return { ok: true, changed };
}

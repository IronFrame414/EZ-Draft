// EZD-410 (S04 Validation "Hosted cabinet left off a wall after a wall move: red 'Not on a wall' flag (Round 11)";
// AC-EZD-410-1; vault/build/assumptions.md EZD-410): whether a cabinet run still stands on its host wall. A wall move
// leaves hosted items where they stand (walls/move.ts), so the flag is read from the model each time, never stored:
// undo, a move back or a wall delete set or clear it with no extra edit. A run stands on its wall when its start lies
// on the wall's location line or one of its faces, its axis runs along the wall (either way), and its rows share some
// length with the wall. A run longer or shorter than its wall is still on it: that is the fit chip's mismatch. A run
// with no host is a freestanding (island) run: a wall move never clears a host, so it is never flagged.
import type { ModelObject, Point } from '../schema';
import { COMPARISON_TOLERANCE_IN } from '../tolerance';
import { wallFaceOffsets, wallLength, type WallObject } from '../walls/wall';
import { cabinetRowSummary, objectLookup, type CabinetRun } from './run';

const tol = COMPARISON_TOLERANCE_IN;
const lower = (s: string) => s.toLowerCase();

export type CabinetRunHostProblem = 'host_not_found' | 'off_wall';

// null when the run stands on its host wall or has none (freestanding); else why it is flagged "Not on a wall".
export function cabinetRunHostProblem(
  run: CabinetRun,
  objects: readonly ModelObject[],
): CabinetRunHostProblem | null {
  const hostId = run.data.geometry.hostWallId;
  if (hostId === null) return null;
  const host = objects.find(
    (o): o is WallObject => o.type === 'wall' && lower(o.id) === lower(hostId),
  );
  if (host === undefined || lower(host.data.level) !== lower(run.data.level))
    return 'host_not_found';
  return cabinetRunOnWall(run, host, objects) ? null : 'off_wall';
}

export const isCabinetRunOffWall = (run: CabinetRun, objects: readonly ModelObject[]): boolean =>
  cabinetRunHostProblem(run, objects) !== null;

function cabinetRunOnWall(
  run: CabinetRun,
  wall: WallObject,
  objects: readonly ModelObject[],
): boolean {
  const { start: ws, end: we } = wall.data.geometry;
  const L = wallLength(wall.data.geometry);
  if (L <= tol) return false;
  const d: Point = { x: (we.x - ws.x) / L, y: (we.y - ws.y) / L };
  const { start, axis } = run.data.geometry;

  // Along the wall, either way: the cross product of the two unit directions is ~0.
  if (Math.abs(axis.x * d.y - axis.y * d.x) > tol / L) return false;

  // The start's signed offset from the location line (left normal positive), against the line and both faces.
  const px = start.x - ws.x;
  const py = start.y - ws.y;
  const across = d.x * py - d.y * px;
  const { oL, oR } = wallFaceOffsets(wall);
  if (![0, oL, oR].some((o) => Math.abs(across - o) <= tol)) return false;

  // The rows' extent along the axis from the start, against the wall's extent on the same axis.
  const lookup = objectLookup(objects);
  const length = Math.max(
    cabinetRowSummary(run, 'base', lookup).total,
    cabinetRowSummary(run, 'upper', lookup).total,
  );
  const a = (ws.x - start.x) * axis.x + (ws.y - start.y) * axis.y;
  const b = (we.x - start.x) * axis.x + (we.y - start.y) * axis.y;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (length <= tol) return lo - tol <= 0 && 0 <= hi + tol;
  return Math.min(hi, length) - Math.max(lo, 0) > tol;
}

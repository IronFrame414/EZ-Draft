// EZD-205b Build step 2 (vault/plans/EZD-205b.md section 3 `findClosures`, Decided "Level and walls", "Wall ends",
// "Components", "Walk order", "Gap", "Kind", "Display", "Gap boundary", "Parallel"; 09j Closure; 00e Wall chain;
// Q-0562; Q-0568; Q-0569 (c); Q-0570; Q-0598 (a); 03g): one closure report per wall chain of a level: closed, a gap
// up to 12" or open. Pure; never mutates its input.
import type { Point } from '../schema';
import { COMPARISON_TOLERANCE_IN } from '../tolerance';
import { findWallJoins, type WallEnd, type WallJoin } from '../walls/joins';
import { DEFAULT_WALL_HEIGHT_IN, wallLength, type WallObject } from '../walls/wall';
import { outlineAreaSqIn } from './area';
import { findRoomOutlines } from './outlines';

export const GAP_LIMIT_IN = 12;

export type GapReport = {
  kind: 'gap';
  wallIds: string[];
  gap: Point;
  sizeIn: number;
  displayIn: number;
  boundary: Point[];
  parallelWallIds: string[];
};

export type ClosureReport =
  | { kind: 'closed'; wallIds: string[] }
  | GapReport
  | { kind: 'open'; wallIds: string[]; gap: Point; sizeIn: number };

export function gapDisplayIn(sizeIn: number): number {
  return Math.max(1, Math.floor(sizeIn * 16 + 0.5)) / 16;
}

const GAP_WALL_ID = 'closure-gap';

type EndState =
  { kind: 'free' } | { kind: 'linked'; other: number; otherEnd: WallEnd } | { kind: 'branched' };

const otherEndOf = (e: WallEnd): WallEnd => (e === 'start' ? 'end' : 'start');

const copy = (p: Point): Point => ({ x: p.x, y: p.y });

// One wall in walk order: `enter` is the end the walk arrives at, the other end is the one it leaves by.
type ChainStep = { wall: number; enter: WallEnd };

type ChainWalk = { walls: WallObject[]; steps: ChainStep[]; closed: boolean };

// The kept walls of the level and their chains (closed loops and two-free-end chains), in report order.
function walkChains(walls: readonly WallObject[], level: string): ChainWalk[] {
  const lvl = level.toLowerCase();
  const kept = walls.filter(
    (w) =>
      w.data.level.toLowerCase() === lvl && wallLength(w.data.geometry) > COMPARISON_TOLERANCE_IN,
  );
  if (kept.length === 0) return [];
  const index = new Map(kept.map((w, i) => [w.id.toLowerCase(), i]));
  const joins = kept.map((w) => findWallJoins(kept, w.id));
  const cornerCount = (i: number, end: WallEnd) =>
    joins[i]!.filter((j) => j.kind === 'corner' && j.end === end).length;
  const hasTeeInto = (i: number, end: WallEnd) =>
    joins[i]!.some((j) => j.kind === 'tee-into' && j.end === end);

  const states: Record<WallEnd, EndState>[] = kept.map((_, i) => {
    const stateOf = (end: WallEnd): EndState => {
      const corners = joins[i]!.filter(
        (j): j is Extract<WallJoin, { kind: 'corner' }> => j.kind === 'corner' && j.end === end,
      );
      const teeInto = hasTeeInto(i, end);
      if (corners.length === 0 && !teeInto) return { kind: 'free' };
      if (corners.length === 1 && !teeInto) {
        const c = corners[0]!;
        const other = index.get(c.otherId.toLowerCase());
        if (other !== undefined && cornerCount(other, c.otherEnd) === 1)
          return { kind: 'linked', other, otherEnd: c.otherEnd };
      }
      return { kind: 'branched' };
    };
    return { start: stateOf('start'), end: stateOf('end') };
  });

  // Components through linked ends, in the order of each component's first wall.
  const component = kept.map(() => -1);
  const members: number[][] = [];
  kept.forEach((_, i) => {
    if (component[i] !== -1) return;
    const c = members.length;
    const list: number[] = [];
    const stack = [i];
    component[i] = c;
    while (stack.length > 0) {
      const k = stack.pop()!;
      list.push(k);
      for (const end of ['start', 'end'] as const) {
        const s = states[k]![end];
        if (s.kind === 'linked' && component[s.other] === -1) {
          component[s.other] = c;
          stack.push(s.other);
        }
      }
    }
    members.push(list);
  });

  const chains: ChainWalk[] = [];
  for (const list of members) {
    const ends = list.flatMap((k) =>
      (['start', 'end'] as const).map((end) => ({ wall: k, end, state: states[k]![end] })),
    );
    if (ends.some((e) => e.state.kind === 'branched')) continue;
    const free = ends.filter((e) => e.state.kind === 'free');
    const sortKey = (k: number) => kept[k]!.id.toLowerCase();
    let first: ChainStep;
    let closed: boolean;
    if (free.length === 0) {
      if (list.length < 3) continue;
      const k = list.reduce((m, x) => (sortKey(x) < sortKey(m) ? x : m));
      first = { wall: k, enter: 'start' };
      closed = true;
    } else if (free.length === 2) {
      const [a, b] = free as [(typeof free)[number], (typeof free)[number]];
      let pick: (typeof free)[number];
      if (a.wall === b.wall) pick = a.end === 'start' ? a : b;
      else if (a.end === 'start' && b.end !== 'start') pick = a;
      else if (b.end === 'start' && a.end !== 'start') pick = b;
      else pick = sortKey(a.wall) <= sortKey(b.wall) ? a : b;
      first = { wall: pick.wall, enter: pick.end };
      closed = false;
    } else continue;

    const steps: ChainStep[] = [];
    let step: ChainStep | null = first;
    while (step !== null && steps.length < list.length) {
      steps.push(step);
      const leave: EndState = states[step.wall]![otherEndOf(step.enter)];
      step = leave.kind === 'linked' ? { wall: leave.other, enter: leave.otherEnd } : null;
    }
    chains.push({ walls: kept, steps, closed });
  }
  return chains;
}

const pointOf = (w: WallObject, end: WallEnd): Point => w.data.geometry[end];

export function findClosures(walls: readonly WallObject[], level: string): ClosureReport[] {
  const lvl = level.toLowerCase();
  const levelWalls = walls.filter((w) => w.data.level.toLowerCase() === lvl);
  return walkChains(walls, level).map((c): ClosureReport => {
    const chainWalls = c.steps.map((s) => c.walls[s.wall]!);
    const wallIds = chainWalls.map((w) => w.id);
    if (c.closed) return { kind: 'closed', wallIds };
    const firstStep = c.steps[0]!;
    const lastStep = c.steps[c.steps.length - 1]!;
    const p0 = pointOf(c.walls[firstStep.wall]!, firstStep.enter);
    const pn = pointOf(c.walls[lastStep.wall]!, otherEndOf(lastStep.enter));
    const gap = { x: p0.x - pn.x, y: p0.y - pn.y };
    const sizeIn = Math.hypot(gap.x, gap.y);
    const open = { kind: 'open' as const, wallIds, gap, sizeIn };
    // EZD-357 (vault/plans/EZD-357.md): the 12" limit is inclusive within the fixed 1/64" tolerance (Q-0568; 03g), as wallLengthProblem does at 200'.
    if (chainWalls.length < 3 || sizeIn - GAP_LIMIT_IN > COMPARISON_TOLERANCE_IN) return open;

    const virtual: WallObject = {
      id: GAP_WALL_ID,
      type: 'wall',
      data: {
        geometry: { start: copy(pn), end: copy(p0) },
        status: 'existing',
        level: chainWalls[0]!.data.level,
        attributes: {
          thickness: 0,
          thicknessSide: 'center',
          height: DEFAULT_WALL_HEIGHT_IN,
          topCutToCeiling: false,
          bearing: false,
          layers: [],
        },
      },
    };
    let boundary: Point[] | null = null;
    let best = Infinity;
    for (const o of findRoomOutlines([...levelWalls, virtual], level)) {
      if (!o.wallIds.includes(GAP_WALL_ID)) continue;
      const area = outlineAreaSqIn(o.boundary);
      if (area < best) {
        best = area;
        boundary = o.boundary;
      }
    }
    if (boundary === null) return open;

    const parallelWallIds = chainWalls
      .filter((w) => {
        const { start, end } = w.data.geometry;
        const len = wallLength(w.data.geometry);
        const ux = (end.x - start.x) / len;
        const uy = (end.y - start.y) / len;
        return Math.abs(gap.x * uy - gap.y * ux) <= COMPARISON_TOLERANCE_IN;
      })
      .map((w) => w.id);
    return {
      kind: 'gap',
      wallIds,
      gap,
      sizeIn,
      displayIn: gapDisplayIn(sizeIn),
      boundary,
      parallelWallIds,
    };
  });
}

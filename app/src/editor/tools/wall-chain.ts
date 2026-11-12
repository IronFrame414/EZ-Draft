// Wall tool chain reducer (EZD-210a; vault/plans/EZD-210a.md section 3 C15-C18, Decided "Wall commit",
// "Open-chain side", "Wall press", "Wall typed", "Close", "Wall double, enter", "Wall escape", "move, release
// (Wall)", "Snap context"; S03 Wall; Q-0558; Q-0560; Q-0568; Q-0569 (b); Q-0570). Pure: no React, no DOM.
import {
  COMPARISON_TOLERANCE_IN,
  createWallData,
  pointInRing,
  pointsEqual,
  resolveTurnDirection,
  type Point,
  type WallObject,
} from '@ezdraft/geometry';
import type { MessageKey } from '../../server/messages/catalog';
import { closeChainSides } from './chain-sides';
import type { ToolContext, ToolInput, ToolStep } from './tool-defs';

export type WallChainState = {
  readonly start: Point | null;
  readonly walls: readonly WallObject[];
  readonly cursor: Point | null;
};

export function initialWallChainState(): WallChainState {
  return { start: null, walls: [], cursor: null };
}

const copy = (p: Point): Point => ({ x: p.x, y: p.y });

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });

function lastPoint(state: WallChainState): Point | null {
  const w = state.walls[state.walls.length - 1];
  return w ? w.data.geometry.end : state.start;
}

const step = (
  state: WallChainState,
  walls: WallObject[] = [],
  message: MessageKey | null = null,
  exit = false,
): ToolStep<WallChainState> => ({ state, walls, message, exit });

function openChainSide(a: Point, b: Point, ctx: ToolContext): 'center' | 'right' {
  const mid: Point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const lvl = ctx.level.toLowerCase();
  const inside = ctx.objects.some(
    (o) =>
      o.type === 'room' &&
      o.data.level.toLowerCase() === lvl &&
      pointInRing(mid, o.data.geometry.boundary),
  );
  return inside ? 'center' : 'right';
}

type Made = { ok: true; wall: WallObject } | { ok: false; message: MessageKey | null };

function makeWall(a: Point, b: Point, ctx: ToolContext): Made {
  const r = createWallData({
    start: a,
    end: b,
    level: ctx.level,
    thicknessSide: openChainSide(a, b, ctx),
  });
  if (!r.ok)
    return { ok: false, message: r.reason === 'too_long' ? 'office.tools.too_long' : null };
  return { ok: true, wall: { id: ctx.newId(), type: 'wall', data: r.data } };
}

function close(
  state: WallChainState,
  start: Point,
  last: Point,
  ctx: ToolContext,
): ToolStep<WallChainState> {
  const made = makeWall(last, copy(start), ctx);
  if (!made.ok) return step(state, [], made.message);
  const chain = [...state.walls, made.wall];
  const sided = closeChainSides(chain);
  const walls = sided.filter(
    (w, i) =>
      i === chain.length - 1 ||
      w.data.attributes.thicknessSide !== chain[i]!.data.attributes.thicknessSide,
  );
  return step({ start: null, walls: [], cursor: state.cursor }, walls);
}

function pressAt(state: WallChainState, at: Point, ctx: ToolContext): ToolStep<WallChainState> {
  const start = state.start;
  if (start === null) return step({ start: copy(at), walls: [], cursor: copy(at) });
  const last = lastPoint(state)!;
  if (pointsEqual(at, last)) return step(state);
  if (pointsEqual(at, start)) {
    if (state.walls.length >= 2) return close(state, start, last, ctx);
    return step(state);
  }
  const made = makeWall(last, at, ctx);
  if (!made.ok) return step(state, [], made.message);
  return step({ start, walls: [...state.walls, made.wall], cursor: state.cursor }, [made.wall]);
}

function typedAt(
  state: WallChainState,
  values: Readonly<Record<string, number | null>>,
  ctx: ToolContext,
): ToolStep<WallChainState> {
  if (state.start === null) return step(state, [], 'office.tools.wall.click_start');
  const length = values.length;
  if (typeof length !== 'number' || !Number.isFinite(length) || length <= COMPARISON_TOLERANCE_IN)
    return step(state);
  const last = lastPoint(state)!;
  const prevWall = state.walls[state.walls.length - 1];
  const previous = prevWall ? sub(prevWall.data.geometry.end, prevWall.data.geometry.start) : null;
  const dir = resolveTurnDirection({
    previous,
    toCursor: sub(state.cursor ?? last, last),
    turnDeg: values.angle ?? null,
  });
  if (dir === null) return step(state, [], 'office.tools.wall.no_direction');
  return pressAt(state, { x: last.x + dir.x * length, y: last.y + dir.y * length }, ctx);
}

export function reduceWallChain(
  state: WallChainState,
  input: ToolInput,
  ctx: ToolContext,
): ToolStep<WallChainState> {
  switch (input.type) {
    case 'move':
      return step({ ...state, cursor: copy(input.at) });
    case 'release':
      return step(state);
    case 'press':
      return pressAt(state, input.at, ctx);
    case 'typed':
      return typedAt(state, input.values, ctx);
    case 'double':
    case 'enter':
      if (state.start === null) return step(state);
      return step({ start: null, walls: [], cursor: state.cursor });
    case 'escape':
      if (state.start === null) return step(state, [], null, true);
      return step({ start: null, walls: [], cursor: state.cursor });
  }
}

export function wallSnapContext(state: WallChainState): {
  anchor: Point | null;
  referenceDirection: Point | null;
} {
  const last = lastPoint(state);
  const w = state.walls[state.walls.length - 1];
  return {
    anchor: last === null ? null : copy(last),
    referenceDirection: w ? sub(w.data.geometry.end, w.data.geometry.start) : null,
  };
}

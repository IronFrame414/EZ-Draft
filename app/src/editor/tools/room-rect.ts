// Room rectangle tool reducer (EZD-210a; vault/plans/EZD-210a.md section 3 C19-C21, Decided "Rectangle input",
// "Rectangle commit"; S03 Room rectangle; Q-0559; Q-0568; Q-0569 (b); Q-0570). Pure: no React, no DOM.
import {
  COMPARISON_TOLERANCE_IN,
  coordsEqual,
  createWallData,
  MAX_WALL_LENGTH_IN,
  pointsEqual,
  type Point,
  type WallObject,
} from '@ezdraft/geometry';
import type { MessageKey } from '../../server/messages/catalog';
import { closeChainSides } from './chain-sides';
import type { ToolContext, ToolInput, ToolStep } from './tool-defs';

export type RoomRectState = {
  readonly corner: Point | null;
  readonly pressed: boolean;
  readonly cursor: Point | null;
};

export function initialRoomRectState(): RoomRectState {
  return { corner: null, pressed: false, cursor: null };
}

const copy = (p: Point): Point => ({ x: p.x, y: p.y });

const step = (
  state: RoomRectState,
  walls: WallObject[] = [],
  message: MessageKey | null = null,
  exit = false,
): ToolStep<RoomRectState> => ({ state, walls, message, exit });

function commit(
  state: RoomRectState,
  c: Point,
  o: Point,
  ctx: ToolContext,
): ToolStep<RoomRectState> {
  const kept: RoomRectState = { corner: c, pressed: false, cursor: state.cursor };
  const w = Math.abs(o.x - c.x);
  const d = Math.abs(o.y - c.y);
  if (w <= COMPARISON_TOLERANCE_IN || d <= COMPARISON_TOLERANCE_IN)
    return step(kept, [], 'office.tools.room_rect.flat');
  if (
    w > MAX_WALL_LENGTH_IN + COMPARISON_TOLERANCE_IN ||
    d > MAX_WALL_LENGTH_IN + COMPARISON_TOLERANCE_IN
  )
    return step(kept, [], 'office.tools.too_long');
  const corners: Point[] = [copy(c), { x: o.x, y: c.y }, copy(o), { x: c.x, y: o.y }];
  const data: WallObject['data'][] = [];
  for (let i = 0; i < 4; i++) {
    const r = createWallData({ start: corners[i]!, end: corners[(i + 1) % 4]!, level: ctx.level });
    if (!r.ok) return step(kept);
    data.push(r.data);
  }
  const walls = data.map((d): WallObject => ({ id: ctx.newId(), type: 'wall', data: d }));
  return step({ corner: null, pressed: false, cursor: state.cursor }, closeChainSides(walls));
}

export function reduceRoomRect(
  state: RoomRectState,
  input: ToolInput,
  ctx: ToolContext,
): ToolStep<RoomRectState> {
  const corner = state.corner;
  switch (input.type) {
    case 'move':
      return step({ ...state, cursor: copy(input.at) });
    case 'press':
      if (corner === null)
        return step({ corner: copy(input.at), pressed: true, cursor: copy(input.at) });
      if (state.pressed || pointsEqual(input.at, corner)) return step(state);
      return commit(state, corner, input.at, ctx);
    case 'release':
      if (corner === null || !state.pressed) return step(state);
      if (pointsEqual(input.at, corner)) return step({ ...state, pressed: false });
      return commit(state, corner, input.at, ctx);
    case 'typed': {
      if (corner === null) return step(state, [], 'office.tools.room_rect.click_corner');
      const width = input.values.width;
      const depth = input.values.depth;
      if (
        typeof width !== 'number' ||
        typeof depth !== 'number' ||
        !Number.isFinite(width) ||
        !Number.isFinite(depth)
      )
        return step(state);
      const cursor = state.cursor;
      const sx = cursor && !coordsEqual(cursor.x, corner.x) ? Math.sign(cursor.x - corner.x) : 1;
      const sy = cursor && !coordsEqual(cursor.y, corner.y) ? Math.sign(cursor.y - corner.y) : -1;
      return commit(state, corner, { x: corner.x + sx * width, y: corner.y + sy * depth }, ctx);
    }
    case 'double':
    case 'enter':
      return step(state);
    case 'escape':
      if (corner === null) return step(state, [], null, true);
      return step({ corner: null, pressed: false, cursor: state.cursor });
  }
}

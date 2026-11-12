// EZD-210a test fixtures (vault/plans/EZD-210a.md section 3 C36, section 4). Imports only @ezdraft/geometry,
// patches.ts, `type ObjectValue` from model-api.ts and the tools index.
import {
  CURRENT_SCHEMA_VERSION,
  NO_NUMBERS,
  createOpeningData,
  createWallData,
  parseStoredObject,
  type ClosureOverride,
  type ModelObject,
  type Point,
  type RoomObject,
  type WallObject,
} from '@ezdraft/geometry';
import { applyEditTo, makeEdit, type Change, type Objects } from '../../model/patches';
import type { ObjectValue } from '../../../lib/outbox/model-api';
import {
  initialRoomRectState,
  initialWallChainState,
  openingsOn,
  reduceRoomRect,
  reduceWallChain,
  toModelObjects,
  wallEditChanges,
  type RoomRectState,
  type ToolContext,
  type ToolInput,
  type ToolStep,
  type WallChainState,
} from '../index';

export const F1 = '11111111-1111-4111-8111-111111111111';
export const F2 = '22222222-2222-4222-8222-222222222222';
export const WHO = '33333333-3333-4333-8333-333333333333';
export const WHEN = '2026-11-06T12:00:00.000Z';

export function uid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

export function idSeq(start: number): () => string {
  let n = start;
  return () => uid(n++);
}

export function baseObjects(): Map<string, ObjectValue> {
  return new Map<string, ObjectValue>([
    [
      F1,
      { type: 'floor', schemaVersion: CURRENT_SCHEMA_VERSION, data: { name: 'Floor 1', order: 1 } },
    ],
  ]);
}

export function withWalls(
  objects: Objects,
  firstId: number,
  pts: Point[],
  closed: boolean,
  side: 'left' | 'right' | 'center' = 'right',
  level: string = F1,
): Map<string, ObjectValue> {
  const next = new Map(objects);
  const segs: [Point, Point][] = [];
  for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i]!, pts[i + 1]!]);
  if (closed) segs.push([pts[pts.length - 1]!, pts[0]!]);
  segs.forEach(([start, end], i) => {
    const r = createWallData({ start, end, level, thicknessSide: side });
    if (!r.ok) throw new Error(`withWalls: wall ${i} refused: ${r.reason}`);
    next.set(uid(firstId + i), {
      type: 'wall',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: r.data as unknown as Record<string, unknown>,
    });
  });
  return next;
}

// Room data shape and the created status 'existing' from P205a Decided "Room data shape", "Create".
export function roomValue(
  boundary: Point[],
  name: string,
  closureOverride: ClosureOverride | null,
  level: string = F1,
): ObjectValue {
  return {
    type: 'room',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: {
      geometry: { boundary: boundary.map((p) => ({ x: p.x, y: p.y })) },
      status: 'existing',
      level,
      attributes: { name },
      closureOverride,
    },
  };
}

export function applyChanges(objects: Objects, changes: Change[]): Map<string, ObjectValue> {
  return applyEditTo(objects, makeEdit(objects, changes), 'forward');
}

function parsedOfType<T extends 'room' | 'wall'>(objects: Objects, type: T) {
  const out: unknown[] = [];
  for (const [id, v] of objects) {
    if (v.type !== type) continue;
    const r = parseStoredObject({
      id,
      type: v.type,
      schema_version: v.schemaVersion,
      data: v.data,
    });
    if (!r.ok) throw new Error(`${type} ${id} does not parse: ${r.issue.issue}`);
    out.push(r.object);
  }
  return out;
}

export function roomsOf(objects: Objects): RoomObject[] {
  return parsedOfType(objects, 'room') as RoomObject[];
}

export function wallsOf(objects: Objects): WallObject[] {
  return parsedOfType(objects, 'wall') as WallObject[];
}

const pt = (x: number, y: number): Point => ({ x, y });

export function typedEnws(lengths: [number, number, number, number]): ToolInput[] {
  const [a, b, c, d] = lengths;
  return [
    { type: 'press', at: pt(0, 0) },
    { type: 'move', at: pt(10, 0) },
    { type: 'typed', values: { length: a, angle: null } },
    { type: 'move', at: pt(a, 50) },
    { type: 'typed', values: { length: b, angle: 90 } },
    { type: 'move', at: pt(a - 50, b) },
    { type: 'typed', values: { length: c, angle: 90 } },
    { type: 'move', at: pt(a - c, b - 50) },
    { type: 'typed', values: { length: d, angle: 90 } },
  ];
}

type Drawn<S> = {
  objects: Map<string, ObjectValue>;
  state: S;
  steps: ToolStep<S>[];
  changes: Change[][];
};

function draw<S>(
  objects: Objects,
  inputs: ToolInput[],
  firstId: number,
  initial: S,
  reduce: (state: S, input: ToolInput, ctx: ToolContext) => ToolStep<S>,
): Drawn<S> {
  const newId = idSeq(firstId);
  let current = new Map(objects);
  let state = initial;
  const steps: ToolStep<S>[] = [];
  const changes: Change[][] = [];
  for (const input of inputs) {
    const ctx: ToolContext = { level: F1, newId, objects: toModelObjects(current, F1) };
    const step = reduce(state, input, ctx);
    const ch = wallEditChanges(current, F1, step.walls, newId, NO_NUMBERS);
    current = applyChanges(current, ch);
    state = step.state;
    steps.push(step);
    changes.push(ch);
  }
  return { objects: current, state, steps, changes };
}

export function drawWithWall(
  objects: Objects,
  inputs: ToolInput[],
  firstId: number,
): Drawn<WallChainState> {
  return draw(objects, inputs, firstId, initialWallChainState(), reduceWallChain);
}

export function drawWithRect(
  objects: Objects,
  inputs: ToolInput[],
  firstId: number,
): Drawn<RoomRectState> {
  return draw(objects, inputs, firstId, initialRoomRectState(), reduceRoomRect);
}

// EZD-212b (vault/plans/EZD-212b.md section 3 "test helper", section 4 Fixtures). An opening with id `uid(n)` on the
// wall `uid(hostN ?? 2)`; `hostN === null` flags it (no host, axis (0, 1)), the EZD-204b M1 pattern.
export function withOpening(
  objects: Objects,
  n: number,
  kind: 'door' | 'window',
  hostN: number | null,
  center: Point,
  level: string = F1,
): Map<string, ObjectValue> {
  const hostId = uid(hostN ?? 2);
  const host = toModelObjects(objects, level).find(
    (o): o is WallObject => o.type === 'wall' && o.id === hostId,
  );
  if (host === undefined) throw new Error(`withOpening: no wall ${hostId}`);
  const data = createOpeningData({ kind, host, center });
  if (hostN === null) {
    data.geometry.hostWallId = null;
    data.geometry.axis = { x: 0, y: 1 };
  }
  const next = new Map(objects);
  next.set(uid(n), {
    type: 'opening',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: data as unknown as Record<string, unknown>,
  });
  return next;
}

const p0 = (x: number, y: number): Point => ({ x, y });

// ROOM: uid(1) S, uid(2) E (144,0)->(144,120), uid(3) N, uid(4) W; DOOR: a 36" door uid(50) on E at (144,60).
export const ROOM: Map<string, ObjectValue> = withWalls(
  baseObjects(),
  1,
  [p0(0, 0), p0(144, 0), p0(144, 120), p0(0, 120)],
  true,
);
export const DOOR: Map<string, ObjectValue> = withOpening(ROOM, 50, 'door', 2, p0(144, 60));

export function objs(o: Objects): ModelObject[] {
  return [...toModelObjects(o, F1), ...openingsOn(o, F1)];
}

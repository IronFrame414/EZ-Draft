// EZD-216 (S03 rail "Dimension (L) | Click two points or a wall face; place the dimension line; type to override
// text"; 05 Q-0682 "Angular dimension: click two walls, then where the arc goes; a Linear / Angular switch in the typed
// dimension bar"; 09-calculations Q-0664 "two points equal within 1/64" place nothing"; AC-EZD-216-1, -2): the
// Dimension tool's steps. Pure: no React, no DOM, no model writes; the controller saves what a step places.
//
// Linear: a press on a point (a snapped end or middle, or anywhere off a wall) sets the first point and the next press
// the second; a press on a wall's body away from a point snap takes that face of the wall (the side pressed). Then the
// line follows the pointer, and the next press places the dimension at that offset. Angular: a press on one wall, a
// press on another, then a press where the arc goes. Esc drops what is half placed, or with nothing ends the tool.
import {
  angularMeasure,
  linearMeasure,
  offsetThrough,
  swingSideOf,
  wallFaceLine,
  type DimensionData,
  type DimensionGeometry,
  type LinearMeasure,
  type ObjectStatus,
  type Point,
  type SnapKind,
  type WallObject,
} from '@ezdraft/geometry';

export type DimensionMode = 'linear' | 'angular';

export type DimensionToolState = {
  mode: DimensionMode;
  // Linear: the first point; or the measured geometry while the line is placed, with the offset under the pointer.
  from: Point | null;
  /** The pointer while the second point is chosen (the preview's far end). */
  to: Point | null;
  placing: { geometry: DimensionGeometry; measure: LinearMeasure; offset: number } | null;
  // Angular: the walls pressed so far, and the arc point under the pointer once both are.
  walls: string[];
  at: Point | null;
};

export type DimensionInput =
  | {
      type: 'press';
      at: Point;
      raw: Point;
      snapKind: SnapKind | null;
      wallId: string | null;
    }
  | { type: 'move'; at: Point }
  | { type: 'mode'; mode: DimensionMode }
  | { type: 'escape' };

export type DimensionContext = {
  level: string;
  walls: readonly WallObject[];
  status: ObjectStatus;
};

export type DimensionStep = {
  state: DimensionToolState;
  /** The dimension placed by this step, to save. */
  place: DimensionData | null;
  exit: boolean;
};

export const initialDimensionState = (mode: DimensionMode = 'linear'): DimensionToolState => ({
  mode,
  from: null,
  to: null,
  placing: null,
  walls: [],
  at: null,
});

const POINT_SNAPS: ReadonlySet<SnapKind> = new Set(['endpoint', 'midpoint']);
const lower = (s: string) => s.toLowerCase();

export function dimensionData(
  geometry: DimensionGeometry,
  offset: number,
  ctx: DimensionContext,
  override: string | null = null,
): DimensionData {
  return {
    geometry,
    status: ctx.status,
    level: ctx.level,
    attributes: {
      kind: geometry.kind === 'walls' ? 'angular' : 'linear',
      offset: geometry.kind === 'walls' ? 0 : offset,
      override,
      auto: null,
      room: null,
    },
  };
}

/** The dimension a press would place now (the linear line at its offset, or the arc through `at`). */
export function pendingDimension(
  s: DimensionToolState,
  ctx: DimensionContext,
): DimensionData | null {
  if (s.placing !== null) return dimensionData(s.placing.geometry, s.placing.offset, ctx);
  if (s.mode === 'angular' && s.walls.length === 2 && s.at !== null)
    return dimensionData({ kind: 'walls', wallIds: [s.walls[0]!, s.walls[1]!], at: s.at }, 0, ctx);
  return null;
}

export function reduceDimension(
  s: DimensionToolState,
  i: DimensionInput,
  ctx: DimensionContext,
): DimensionStep {
  const same: DimensionStep = { state: s, place: null, exit: false };
  const wall = (id: string | null) =>
    id === null ? null : (ctx.walls.find((w) => lower(w.id) === lower(id)) ?? null);

  if (i.type === 'mode') {
    if (i.mode === s.mode) return same;
    return { state: initialDimensionState(i.mode), place: null, exit: false };
  }
  if (i.type === 'escape') {
    const started = s.from !== null || s.placing !== null || s.walls.length > 0;
    return started
      ? { state: initialDimensionState(s.mode), place: null, exit: false }
      : { state: s, place: null, exit: true };
  }
  if (i.type === 'move') {
    if (s.placing !== null)
      return {
        state: { ...s, placing: { ...s.placing, offset: offsetThrough(s.placing.measure, i.at) } },
        place: null,
        exit: false,
      };
    if (s.mode === 'angular' && s.walls.length === 2)
      return { state: { ...s, at: i.at }, place: null, exit: false };
    if (s.from !== null) return { state: { ...s, to: i.at }, place: null, exit: false };
    return same;
  }

  // A press.
  if (s.mode === 'angular') {
    if (s.walls.length < 2) {
      const w = wall(i.wallId);
      if (w === null || s.walls.some((x) => lower(x) === lower(w.id))) return same;
      if (s.walls.length === 1) {
        const a = wall(s.walls[0]!);
        // Parallel walls have no angle: the second press is not taken.
        if (a === null || angularMeasure(a.data.geometry, w.data.geometry, i.raw) === null)
          return same;
        return { state: { ...s, walls: [...s.walls, w.id], at: i.raw }, place: null, exit: false };
      }
      return { state: { ...s, walls: [w.id] }, place: null, exit: false };
    }
    const a = wall(s.walls[0]!);
    const b = wall(s.walls[1]!);
    if (a === null || b === null || angularMeasure(a.data.geometry, b.data.geometry, i.at) === null)
      return same;
    const placed = dimensionData({ kind: 'walls', wallIds: [a.id, b.id], at: i.at }, 0, ctx);
    return { state: initialDimensionState('angular'), place: placed, exit: false };
  }

  if (s.placing !== null) {
    const placed = dimensionData(s.placing.geometry, offsetThrough(s.placing.measure, i.at), ctx);
    return { state: initialDimensionState('linear'), place: placed, exit: false };
  }
  if (s.from !== null) {
    const m = linearMeasure(s.from, i.at);
    // 03g: two points within 1/64" place nothing; the tool starts again.
    if (m === null) return { state: initialDimensionState('linear'), place: null, exit: false };
    return {
      state: {
        ...s,
        from: null,
        to: null,
        placing: { geometry: { kind: 'points', from: s.from, to: i.at }, measure: m, offset: 0 },
      },
      place: null,
      exit: false,
    };
  }
  const w = wall(i.wallId);
  if (w !== null && (i.snapKind === null || !POINT_SNAPS.has(i.snapKind))) {
    const face = swingSideOf(w, i.raw);
    const line = wallFaceLine(w, face);
    const m = line === null ? null : linearMeasure(line.from, line.to);
    if (m !== null)
      return {
        state: {
          ...s,
          placing: {
            geometry: { kind: 'wall_face', wallId: w.id, face },
            measure: m,
            offset: offsetThrough(m, i.raw),
          },
        },
        place: null,
        exit: false,
      };
  }
  return { state: { ...s, from: i.at, to: i.at }, place: null, exit: false };
}

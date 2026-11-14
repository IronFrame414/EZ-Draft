// EZD-223 (S03 Sketch; S15d iPad input mode; Q-0392; AC-EZD-223-1 to -4): the Sketch tool's pointer steps. Pure: no
// React, no DOM. A stroke runs from press to lift and cleans up on lift; a pointer held still for HOLD_MS before the
// lift keeps the raw stroke. With iPad drawing set to Pencil only, a touch pointer never draws (Pencil and mouse
// do). Thresholds: vault/build/assumptions.md EZD-223. The lift hands back the points and whether they were held; the
// controller cleans them with the lazily loaded `cleanStroke`.
import type { Point } from '@ezdraft/geometry';
import type { IpadDrawing } from '../../lib/profile/profile';

// Held still this long (ms) before the lift keeps the raw stroke.
export const SKETCH_HOLD_MS = 500;
// Moving less than this (screen px) counts as holding still.
export const SKETCH_HOLD_PX = 4;

export type SketchStroke = {
  pointerType: string;
  points: Point[];
  rest: Point;
  restSince: number;
};

export type SketchState = { stroke: SketchStroke | null };

export type SketchEvent = {
  kind: 'down' | 'move' | 'up' | 'cancel';
  model: Point;
  screen: Point;
  pointerType: string;
  time: number;
};

export type SketchStep = {
  state: SketchState;
  done: { points: readonly Point[]; held: boolean } | null;
};

export const initialSketchState = (): SketchState => ({ stroke: null });

// Whether this pointer may draw under the user's iPad drawing setting.
export const sketchDraws = (pointerType: string, mode: IpadDrawing): boolean =>
  !(mode === 'pencil' && pointerType === 'touch');

export function reduceSketch(state: SketchState, e: SketchEvent, mode: IpadDrawing): SketchStep {
  const same = { state, done: null };
  if (!sketchDraws(e.pointerType, mode)) return same;
  const s = state.stroke;
  if (e.kind === 'down') {
    return {
      state: {
        stroke: {
          pointerType: e.pointerType,
          points: [e.model],
          rest: e.screen,
          restSince: e.time,
        },
      },
      done: null,
    };
  }
  if (s === null || s.pointerType !== e.pointerType) return same;
  if (e.kind === 'cancel') return { state: { stroke: null }, done: null };
  const last = s.points[s.points.length - 1]!;
  const points = last.x === e.model.x && last.y === e.model.y ? s.points : [...s.points, e.model];
  const moved = Math.hypot(e.screen.x - s.rest.x, e.screen.y - s.rest.y) > SKETCH_HOLD_PX;
  const rest = moved ? e.screen : s.rest;
  const restSince = moved ? e.time : s.restSince;
  if (e.kind === 'move') return { state: { stroke: { ...s, points, rest, restSince } }, done: null };
  // Lift: a stroke of one point draws nothing.
  if (points.length < 2) return { state: { stroke: null }, done: null };
  const held = e.time - restSince >= SKETCH_HOLD_MS;
  return { state: { stroke: null }, done: { points, held } };
}

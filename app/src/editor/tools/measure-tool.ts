// EZD-231 (04 Tool rail "Measure | Shift+L | Distance between two points; no model change | Every editor tab"; S06
// Measure "Allowed in view only"; Q-0697; AC-EZD-231-1 to -3): the Measure tool's steps. Pure: no React, no DOM, no
// model writes. A press sets the first point, moves stretch the line, the next press fixes it, and a press after
// that starts a new measure. Esc drops the measure, or with none ends the tool. The distance reads in the plan's
// display rounding (1/2", 03g), as every plan length does.
import { formatChipDistance, type Point } from '@ezdraft/geometry';

export type MeasureState = { from: Point | null; to: Point | null; fixed: boolean };

export type MeasureInput =
  { type: 'press'; at: Point } | { type: 'move'; at: Point } | { type: 'escape' };

export type MeasureStep = { state: MeasureState; exit: boolean };

export const initialMeasureState = (): MeasureState => ({ from: null, to: null, fixed: false });

export function reduceMeasure(state: MeasureState, i: MeasureInput): MeasureStep {
  if (i.type === 'escape') {
    if (state.from !== null) return { state: initialMeasureState(), exit: false };
    return { state, exit: true };
  }
  if (i.type === 'move') {
    if (state.from === null || state.fixed) return { state, exit: false };
    return { state: { ...state, to: i.at }, exit: false };
  }
  if (state.from === null || state.fixed) {
    return { state: { from: i.at, to: i.at, fixed: false }, exit: false };
  }
  return { state: { from: state.from, to: i.at, fixed: true }, exit: false };
}

export const measureText = (from: Point, to: Point): string =>
  formatChipDistance(Math.hypot(to.x - from.x, to.y - from.y));

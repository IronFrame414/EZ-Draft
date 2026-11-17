// EZD-237 (vault/plans/EZD-237.md section 3 C5, Decided D-Frame, D-Script, D-Level, D-Pan, D-Zoom, D-Drag, D-Wall,
// D-Abort; 11 Performance; 09m Benchmark run row 1; AC-EZD-237-1): the scripted pan, zoom and wall drag on the
// benchmark project. Each step fits the plan, waits two frames, then plays 180 frames and records the time between
// consecutive animation frames. The drag ends in cancel, so nothing is committed or saved. Memory is read once,
// after the drag.
import { benchmarkObjectId, type Point } from '@ezdraft/geometry';
import {
  BENCHMARK_STEP_FRAMES,
  BENCHMARK_STEPS,
  stepStats,
  type BenchmarkResults,
  type BenchmarkStep,
  type StepResult,
} from '../../lib/benchmark/benchmark-run';
import type { PlanCanvasHandle } from '../plan/controller';
import type { PlanPointerEvent } from '../plan/input';
import { panBy } from '../plan/view';
import type { DrawingController } from '../tools/drawing-controller';

export const PAN_PX = 300;
export const ZOOM_MAX_FACTOR = 4;
export const DRAG_MAX_IN = 36;
export const SETTLE_FRAMES = 2;
export const PLAN_READY_TIMEOUT_MS = 30000;
// D-Wall: Floor 1 vertical wall at row 8, column 11, (1320, 960) to (1320, 1080).
export const BENCHMARK_DRAG_WALL_ID = benchmarkObjectId(562);
// Progress goes to the card every this many frames (and at each step start), not on every frame.
export const PROGRESS_EVERY = 30;

const HALF_SWEEP = 45;

// D-Level: two out-and-back sweeps of 45 steps each way.
export function sweepLevel(j: number): number {
  const s = ((j - 1) % (2 * HALF_SWEEP)) + 1;
  return s <= HALF_SWEEP ? s : 2 * HALF_SWEEP - s;
}

export type BenchmarkScriptDeps = {
  handle: Pick<PlanCanvasHandle, 'getView' | 'setView' | 'fit' | 'modelToScreen'>;
  drag: Pick<DrawingController, 'startDrag' | 'dragPointer'>;
  wallId: string;
  anchor: Point;
  nextFrame: () => Promise<number>;
  readMemory: () => number | null;
  signal: AbortSignal;
  onProgress?: (step: BenchmarkStep, frame: number) => void;
};

const pointer = (kind: 'move' | 'cancel', model: Point, screen: Point): PlanPointerEvent => ({
  kind,
  model,
  screen,
  pointerType: 'mouse',
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
});

export async function runBenchmarkScript(deps: BenchmarkScriptDeps): Promise<BenchmarkResults> {
  const { handle, drag, anchor, signal } = deps;
  let dragging = false;
  const cancelDrag = () => {
    if (!dragging) return;
    dragging = false;
    drag.dragPointer(pointer('cancel', anchor, handle.modelToScreen(anchor)));
  };
  const frame = async () => {
    const t = await deps.nextFrame();
    if (signal.aborted) {
      cancelDrag();
      throw new Error('benchmark_aborted');
    }
    return t;
  };
  if (signal.aborted) throw new Error('benchmark_aborted');

  const results: Partial<Record<BenchmarkStep, StepResult>> = {};
  for (const step of BENCHMARK_STEPS) {
    handle.fit();
    for (let i = 0; i < SETTLE_FRAMES; i++) await frame();
    const view0 = handle.getView();
    const anchorScreen = handle.modelToScreen(anchor);
    if (step === 'drag') {
      drag.startDrag([deps.wallId], anchor);
      dragging = true;
    }
    const apply = (j: number) => {
      const level = sweepLevel(j) / HALF_SWEEP;
      if (step === 'pan') {
        handle.setView(panBy(view0, PAN_PX * level, 0));
      } else if (step === 'zoom') {
        // D-Zoom: zoom about the anchor's screen point; setView clamps the scale.
        const ppi = view0.ppi * ZOOM_MAX_FACTOR ** level;
        handle.setView({
          x: anchor.x - anchorScreen.x / ppi,
          y: anchor.y + anchorScreen.y / ppi,
          ppi,
        });
      } else {
        const model = { x: anchor.x + DRAG_MAX_IN * level, y: anchor.y };
        drag.dragPointer(pointer('move', model, handle.modelToScreen(model)));
      }
    };
    deps.onProgress?.(step, 0);
    const intervals: number[] = [];
    let prev = 0;
    for (let k = 0; k <= BENCHMARK_STEP_FRAMES; k++) {
      const t = await frame();
      if (k >= 1) intervals.push(t - prev);
      prev = t;
      if (k < BENCHMARK_STEP_FRAMES) apply(k + 1);
      if (k > 0 && k % PROGRESS_EVERY === 0) deps.onProgress?.(step, k);
    }
    cancelDrag();
    results[step] = stepStats(intervals);
  }
  handle.fit();
  return {
    pan: results.pan!,
    zoom: results.zoom!,
    drag: results.drag!,
    memory: deps.readMemory(),
  };
}

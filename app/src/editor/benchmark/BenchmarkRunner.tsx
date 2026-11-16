'use client';

// EZD-237 (vault/plans/EZD-237.md section 3 C6, Decided D-Runner, D-Cover, D-Abort; S15i: the benchmark plays
// with its progress shown in the Benchmark card and the page stays open; AC-EZD-237-1): runs inside the editor
// when it is opened with `?benchmark=run` in the Benchmark card's frame. It checks Edit model and that this is the
// benchmark project, waits for the plan to draw (30 s at most), plays the script, and sends progress, the result
// or an error code to the card (same origin only). The card saves the run. A cover takes the pointer so input
// cannot disturb the run.
import { wallDataSchema, type Point } from '@ezdraft/geometry';
import { useEffect, useRef, type ReactElement } from 'react';
import {
  BENCHMARK_MESSAGE_TYPE,
  readHeapMb,
  type BenchmarkMessage,
  type BenchmarkRunnerError,
} from '../../lib/benchmark/benchmark-run';
import type { ModelStore } from '../model/model-store';
import type { PlanController } from '../plan/controller';
import type { DrawingController } from '../tools/drawing-controller';
import {
  BENCHMARK_DRAG_WALL_ID,
  PLAN_READY_TIMEOUT_MS,
  runBenchmarkScript,
} from './benchmark-script';
import styles from './BenchmarkRunner.module.css';

// Messages for the card, without the type tag (added on send).
export type BenchmarkReport =
  | { kind: 'progress'; step: 'pan' | 'zoom' | 'drag'; frame: number }
  | { kind: 'result'; results: Extract<BenchmarkMessage, { kind: 'result' }>['results'] }
  | { kind: 'error'; code: BenchmarkRunnerError };

export type BenchmarkRunnerProps = {
  plan: Pick<PlanController, 'handle' | 'stats'>;
  drawing: Pick<DrawingController, 'startDrag' | 'dragPointer'>;
  store: Pick<ModelStore, 'getState'>;
  canEdit: boolean;
  nextFrame?: () => Promise<number>;
  report?: (message: BenchmarkMessage) => void;
  readMemory?: () => number | null;
};

const animationFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

// The card is the parent frame on the same origin; nothing is sent anywhere else.
const toParent = (message: BenchmarkMessage) => {
  window.parent.postMessage(message, window.location.origin);
};

const heap = () => readHeapMb(performance as { memory?: { usedJSHeapSize?: unknown } });

// D-Wall: the anchor is the midpoint of the wall's own geometry; null when this is not the benchmark project.
export function benchmarkAnchor(store: Pick<ModelStore, 'getState'>): Point | null {
  const wall = store.getState().objects.get(BENCHMARK_DRAG_WALL_ID);
  if (wall === undefined || wall.type !== 'wall') return null;
  const parsed = wallDataSchema.safeParse(wall.data);
  if (!parsed.success) return null;
  const { start, end } = parsed.data.geometry;
  return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
}

export type PlayDeps = Required<Omit<BenchmarkRunnerProps, 'report'>> & {
  signal: AbortSignal;
  send: (message: BenchmarkReport) => void;
};

// D-Runner order: Edit model, then the benchmark wall, then the plan drawn with text (30 s by frame time), then
// the script. An abort (unmount) sends nothing more; any other failure sends `failed`.
export async function playBenchmark(d: PlayDeps): Promise<void> {
  const send = (m: BenchmarkReport) => {
    if (!d.signal.aborted) d.send(m);
  };
  try {
    if (!d.canEdit) return send({ kind: 'error', code: 'not_authorized' });
    const anchor = benchmarkAnchor(d.store);
    if (anchor === null) return send({ kind: 'error', code: 'not_benchmark' });
    let first: number | null = null;
    for (;;) {
      const t = await d.nextFrame();
      if (d.signal.aborted) return;
      first ??= t;
      const s = d.plan.stats();
      if (s.frames > 0 && s.glyphs > 0) break;
      if (t - first >= PLAN_READY_TIMEOUT_MS) return send({ kind: 'error', code: 'plan_not_ready' });
    }
    const results = await runBenchmarkScript({
      handle: d.plan.handle,
      drag: d.drawing,
      wallId: BENCHMARK_DRAG_WALL_ID,
      anchor,
      nextFrame: d.nextFrame,
      readMemory: d.readMemory,
      signal: d.signal,
      onProgress: (step, frame) => send({ kind: 'progress', step, frame }),
    });
    send({ kind: 'result', results });
  } catch {
    send({ kind: 'error', code: 'failed' });
  }
}

export function BenchmarkRunner({
  plan,
  drawing,
  store,
  canEdit,
  nextFrame = animationFrame,
  report = toParent,
  readMemory = heap,
}: BenchmarkRunnerProps): ReactElement {
  const deps = useRef({ plan, drawing, store, canEdit, nextFrame, report, readMemory });

  useEffect(() => {
    const ctl = new AbortController();
    const { report: post, ...rest } = deps.current;
    void playBenchmark({
      ...rest,
      signal: ctl.signal,
      send: (m) => post({ type: BENCHMARK_MESSAGE_TYPE, ...m } as BenchmarkMessage),
    });
    return () => ctl.abort();
  }, []);

  return <div className={styles.cover} data-testid="benchmark-running" aria-hidden="true" />;
}

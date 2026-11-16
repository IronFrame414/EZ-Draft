// EZD-237 T5-T7 (vault/plans/EZD-237.md section 4; AC-EZD-237-1). Fakes per section 4: `fakeFrames(extra)` makes
// a nextFrame whose n-th call (1-based) resolves 16 n plus every extra[m] for m ≤ n; the handle's view is
// { x: 0, y: 0, ppi: 1 } and modelToScreen is the identity. Expected values: Decided D-Script (3 steps × (2 settle
// + 181) = 549 frames, fit 4 times, 180 intervals per step), D-Level (45 out, 45 back, twice), D-Pan (300 px:
// panBy moves x by −300 / ppi), D-Zoom (factor 4 at the top of the sweep), D-Drag (36 in, ending in cancel at the
// anchor), D-Wall (benchmark object 562, (1320, 960) to (1320, 1080)), D-Stats, D-Abort.
import { generateBenchmarkModel } from '@ezdraft/geometry';
import { describe, expect, it, vi } from 'vitest';
import type { PlanView } from '../plan/view';
import type { PlanPointerEvent } from '../plan/input';
import {
  BENCHMARK_DRAG_WALL_ID,
  runBenchmarkScript,
  sweepLevel,
  type BenchmarkScriptDeps,
} from './benchmark-script';

function fakeFrames(extra: Record<number, number> = {}) {
  let n = 0;
  let added = 0;
  const fn = vi.fn(async () => {
    n += 1;
    added += extra[n] ?? 0;
    return 16 * n + added;
  });
  return fn;
}

const ANCHOR = { x: 1320, y: 1020 };

function fakes(nextFrame: () => Promise<number>, signal = new AbortController().signal) {
  const log: string[] = [];
  const views: PlanView[] = [];
  const events: PlanPointerEvent[] = [];
  const handle = {
    getView: () => ({ x: 0, y: 0, ppi: 1 }),
    setView: vi.fn((v: PlanView) => {
      views.push(v);
      log.push('setView');
    }),
    fit: vi.fn(() => log.push('fit')),
    modelToScreen: (p: { x: number; y: number }) => p,
  };
  const drag = {
    startDrag: vi.fn(() => log.push('startDrag')),
    dragPointer: vi.fn((e: PlanPointerEvent) => {
      events.push(e);
      log.push(`drag:${e.kind}`);
    }),
  };
  const deps: BenchmarkScriptDeps = {
    handle,
    drag,
    wallId: BENCHMARK_DRAG_WALL_ID,
    anchor: ANCHOR,
    nextFrame,
    readMemory: () => 50,
    signal,
  };
  return { deps, handle, drag, views, events, log };
}

const FLAT = { frames: 180, meanMs: 16, p95Ms: 16, maxMs: 16, over100: 0 };

describe('EZD-237 benchmark script', () => {
  it('EZD-237 T5 sweepLevel goes out and back twice', () => {
    expect([1, 45, 46, 90, 91, 135, 180].map(sweepLevel)).toEqual([1, 45, 44, 0, 1, 45, 0]);
  });

  it('EZD-237 the drag wall is the Floor 1 wall at (1320, 960) to (1320, 1080)', () => {
    const wall = generateBenchmarkModel().find((o) => o.id === BENCHMARK_DRAG_WALL_ID);
    expect(wall?.type).toBe('wall');
    const g = (wall?.data as { geometry: { start: unknown; end: unknown } }).geometry;
    expect([g.start, g.end]).toEqual([
      { x: 1320, y: 960 },
      { x: 1320, y: 1080 },
    ]);
  });

  it('EZD-237 T6 plays pan, zoom and drag in order and times 180 frames each', async () => {
    const nextFrame = fakeFrames();
    const f = fakes(nextFrame);
    const results = await runBenchmarkScript(f.deps);
    expect(nextFrame).toHaveBeenCalledTimes(549);
    expect(f.handle.fit).toHaveBeenCalledTimes(4);
    expect(f.views).toHaveLength(360);
    expect(f.views[44]).toEqual({ x: -300, y: 0, ppi: 1 });
    expect(f.views[180 + 44]!.ppi).toBe(4);
    expect(f.views[180 + 89]!.ppi).toBe(1);
    expect(f.drag.startDrag).toHaveBeenCalledTimes(1);
    expect(f.drag.startDrag).toHaveBeenCalledWith([BENCHMARK_DRAG_WALL_ID], ANCHOR);
    expect(f.log.indexOf('startDrag')).toBeGreaterThan(f.log.lastIndexOf('setView'));
    expect(f.events).toHaveLength(181);
    expect(f.events[44]).toMatchObject({ kind: 'move', model: { x: 1356, y: 1020 } });
    expect(f.events[179]).toMatchObject({ kind: 'move', model: { x: 1320, y: 1020 } });
    expect(f.events[180]).toMatchObject({ kind: 'cancel', model: ANCHOR });
    expect(f.events.some((e) => e.kind === 'up')).toBe(false);
    expect(results).toEqual({ pan: FLAT, zoom: FLAT, drag: FLAT, memory: 50 });
  });

  it('EZD-237 T7 a slow frame shows in its step; an abort cancels the drag and stops', async () => {
    const slow = await runBenchmarkScript(fakes(fakeFrames({ 250: 124 })).deps);
    expect(slow.zoom).toEqual({ frames: 180, meanMs: 16.7, p95Ms: 16, maxMs: 140, over100: 1 });
    expect(slow.pan).toEqual(FLAT);
    expect(slow.drag).toEqual(FLAT);

    const ctl = new AbortController();
    const base = fakeFrames();
    const nextFrame = vi.fn(async () => {
      const t = await base();
      if (base.mock.calls.length === 400) ctl.abort();
      return t;
    });
    const f = fakes(nextFrame, ctl.signal);
    await expect(runBenchmarkScript(f.deps)).rejects.toThrow('benchmark_aborted');
    expect(nextFrame).toHaveBeenCalledTimes(400);
    expect(f.events.filter((e) => e.kind === 'cancel')).toHaveLength(1);
  });
});

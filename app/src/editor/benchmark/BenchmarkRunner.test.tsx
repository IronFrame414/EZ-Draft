// EZD-237 T14, T15 (vault/plans/EZD-237.md section 4; AC-EZD-237-1; S15i: the run plays with its progress in the
// Benchmark card). The Vitest environment is node, so the runner's order is tested through `playBenchmark` with
// the section 4 fakes, and the component as static markup. Expected values: Decided D-Runner (Edit model, then
// the benchmark wall, then the plan drawn with text, 30 s by frame time, then the script), D-Cover (the cover's
// test id), D-Script (549 frames; 180 per step, progress every 30), D-Wall (anchor (1320, 1020)).
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
import { generateBenchmarkModel } from '@ezdraft/geometry/benchmark';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import type { PlanView } from '../plan/view';
import { BENCHMARK_DRAG_WALL_ID } from './benchmark-script';
import {
  BenchmarkRunner,
  benchmarkAnchor,
  playBenchmark,
  type BenchmarkReport,
  type PlayDeps,
} from './BenchmarkRunner';

function fakeFrames(extra: Record<number, number> = {}) {
  let n = 0;
  let added = 0;
  return vi.fn(async () => {
    n += 1;
    added += extra[n] ?? 0;
    return 16 * n + added;
  });
}

const benchmarkObjects = () =>
  new Map<string, ObjectValue>(
    generateBenchmarkModel().map((o) => [
      o.id,
      { type: o.type, schemaVersion: o.schema_version, data: o.data as Record<string, unknown> },
    ]),
  );

function deps(over: Partial<PlayDeps> = {}, glyphsAfter = 0) {
  const sent: BenchmarkReport[] = [];
  let statsCalls = 0;
  const startDrag = vi.fn();
  const d: PlayDeps = {
    plan: {
      handle: {
        getView: () => ({ x: 0, y: 0, ppi: 1 }),
        setView: (_v: PlanView) => {},
        fit: () => {},
        modelToScreen: (p: { x: number; y: number }) => p,
      } as never,
      stats: () => {
        statsCalls += 1;
        return {
          frames: 1,
          drawCalls: 1,
          bufferUploads: 0,
          glyphs: statsCalls > glyphsAfter ? 1 : 0,
          highlightUploads: 0,
          selectionUploads: 0,
        };
      },
    },
    drawing: { startDrag, dragPointer: vi.fn() },
    store: { getState: () => ({ objects: benchmarkObjects() }) as never },
    canEdit: true,
    nextFrame: fakeFrames(),
    readMemory: () => null,
    signal: new AbortController().signal,
    send: (m) => sent.push(m),
    ...over,
  };
  return { d, sent, startDrag };
}

const FLAT = { frames: 180, meanMs: 16, p95Ms: 16, maxMs: 16, over100: 0 };

describe('EZD-237 benchmark runner', () => {
  it('EZD-237 the anchor is the drag wall midpoint; another project has none', () => {
    expect(benchmarkAnchor({ getState: () => ({ objects: benchmarkObjects() }) as never })).toEqual({
      x: 1320,
      y: 1020,
    });
    const other = new Map<string, ObjectValue>([
      [BENCHMARK_DRAG_WALL_ID, { type: 'room', schemaVersion: CURRENT_SCHEMA_VERSION, data: {} }],
    ]);
    expect(benchmarkAnchor({ getState: () => ({ objects: other }) as never })).toBeNull();
  });

  it('EZD-237 T14 waits for text, plays, reports progress then one result', async () => {
    const nextFrame = fakeFrames();
    const { d, sent } = deps({ nextFrame }, 3);
    await playBenchmark(d);
    // 3 frames without glyphs, the 4th has them; then 549 script frames.
    expect(nextFrame).toHaveBeenCalledTimes(4 + 549);
    const progress = sent.filter((m) => m.kind === 'progress');
    expect(progress[0]).toEqual({ kind: 'progress', step: 'pan', frame: 0 });
    expect(progress).toContainEqual({ kind: 'progress', step: 'zoom', frame: 90 });
    expect(progress.at(-1)).toEqual({ kind: 'progress', step: 'drag', frame: 180 });
    expect(progress).toHaveLength(3 * 7);
    expect(sent.at(-1)).toEqual({
      kind: 'result',
      results: { pan: FLAT, zoom: FLAT, drag: FLAT, memory: null },
    });
    expect(sent.filter((m) => m.kind === 'result')).toHaveLength(1);
  });

  it('EZD-237 T15 refusals: no Edit model, not the benchmark, plan not ready', async () => {
    const a = deps({ canEdit: false });
    await playBenchmark(a.d);
    expect(a.sent).toEqual([{ kind: 'error', code: 'not_authorized' }]);
    expect(a.d.nextFrame).not.toHaveBeenCalled();

    const b = deps({ store: { getState: () => ({ objects: new Map() }) as never } });
    await playBenchmark(b.d);
    expect(b.sent).toEqual([{ kind: 'error', code: 'not_benchmark' }]);
    expect(b.startDrag).not.toHaveBeenCalled();

    // Glyphs never come; the second frame is 30,032 ms, 30,016 after the first.
    const c = deps({ nextFrame: fakeFrames({ 2: 30000 }) }, Number.POSITIVE_INFINITY);
    await playBenchmark(c.d);
    expect(c.sent).toEqual([{ kind: 'error', code: 'plan_not_ready' }]);
    expect(c.startDrag).not.toHaveBeenCalled();
  });

  it('EZD-237 an abort sends nothing more; a throw sends failed', async () => {
    const ctl = new AbortController();
    const base = fakeFrames();
    const nextFrame = vi.fn(async () => {
      const t = await base();
      if (base.mock.calls.length === 100) ctl.abort();
      return t;
    });
    const a = deps({ nextFrame, signal: ctl.signal });
    await playBenchmark(a.d);
    expect(a.sent.some((m) => m.kind !== 'progress')).toBe(false);

    const b = deps({ readMemory: () => {
      throw new Error('boom');
    } });
    await playBenchmark(b.d);
    expect(b.sent.at(-1)).toEqual({ kind: 'error', code: 'failed' });
  });

  it('EZD-237 the cover takes the pointer while it plays', () => {
    const { d } = deps();
    const html = renderToStaticMarkup(
      <BenchmarkRunner plan={d.plan} drawing={d.drawing} store={d.store} canEdit />,
    );
    expect(html).toContain('data-testid="benchmark-running"');
  });
});

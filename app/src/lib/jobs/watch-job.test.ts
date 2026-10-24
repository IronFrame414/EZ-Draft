// EZD-009 T17 (vault/plans/EZD-009.md Tests; Step 7 watch-job.ts): push, not poll (11 rule 11). A fake
// channel stands in for the EZD-018 project handle. Values are test inputs; counts follow the plan.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchJob } from './watch-job';

type Cb = (payload: unknown) => void;

function fakeChannel() {
  const listeners: Cb[] = [];
  const resyncs: Array<() => void | Promise<void>> = [];
  return {
    channel: {
      on: (event: string, cb: Cb) => {
        if (event === 'job.progress') listeners.push(cb);
        return () => {};
      },
      onResync: (cb: () => void | Promise<void>) => {
        resyncs.push(cb);
        return () => {};
      },
    },
    emit: (payload: Record<string, unknown>) => listeners.forEach((cb) => cb(payload)),
    resync: async () => {
      for (const cb of resyncs) await cb();
    },
  };
}

const progress = (jobId: string, status: string, pct: number) => ({
  jobId,
  kind: 'test',
  status,
  progress: pct,
  attempts: 1,
});

describe('EZD-009 watchJob', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('EZD-009 T17 watchJob: own job only, one fetch per finish and per resync, no timers', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const fake = fakeChannel();
    const fetchJob = vi.fn(async () => ({
      status: 'done',
      progress: 100,
      attempts: 1,
      result: { steps: 2 },
      error: null,
    }));
    const onChange = vi.fn();
    watchJob({
      channel: fake.channel as never,
      jobId: 'X',
      fetchJob: fetchJob as never,
      onChange,
    });

    fake.emit(progress('X', 'running', 50));
    fake.emit(progress('Y', 'running', 77));
    expect(fetchJob).toHaveBeenCalledTimes(0);
    fake.emit(progress('X', 'done', 100));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchJob).toHaveBeenCalledTimes(1);
    fake.emit(progress('X', 'done', 100));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchJob).toHaveBeenCalledTimes(1);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'running', progress: 50 }),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'done', progress: 100 }),
    );
    for (const call of onChange.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('77');
    }

    await fake.resync();
    await fake.resync();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchJob).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(fetchJob).toHaveBeenCalledTimes(3);
    expect(setIntervalSpy).toHaveBeenCalledTimes(0);
  });
});

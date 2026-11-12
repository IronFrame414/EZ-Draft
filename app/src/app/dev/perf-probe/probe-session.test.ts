// EZD-235b V1, V2 (vault/plans/EZD-235b.md section 4; AC-EZD-235-3): the probe session on a fake pool.
import { describe, expect, it, vi } from 'vitest';
import { startProbeSession, type ProbeHost } from './probe-session';

type Deferred = {
  promise: Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
};
function deferred(): Deferred {
  let resolve!: (v: unknown) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // A rejection the test handles later is not an unhandled rejection.
  promise.catch(() => {});
  return { promise, resolve, reject };
}

function fakePool(jobs: Deferred[]) {
  let i = 0;
  const run = vi.fn(() => jobs[i++]!.promise);
  const dispose = vi.fn();
  return {
    pool: { run, dispose } as unknown as Parameters<typeof startProbeSession>[0]['pool'],
    run,
    dispose,
  };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 20));

describe('EZD-235b probe session', () => {
  it('EZD-235b V1 probe session warms up, then its hook runs the 500 ms job and stop disposes once', async () => {
    const [warm, job1, job2] = [deferred(), deferred(), deferred()];
    const { pool, run, dispose } = fakePool([warm, job1, job2]);
    const host: ProbeHost = {};
    const onState = vi.fn();
    const times = [10, 510];
    let t = 0;
    const now = () => times[t++] ?? 0;
    const stop = startProbeSession({ pool, host, onState, now });

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenNthCalledWith(1, 'probe-room-areas', { minMs: 0 });
    expect(host.__ezdraftWorkerProbe).toBeUndefined();
    expect(onState).not.toHaveBeenCalled();

    warm.resolve({ rooms: 720, passes: 1, ranMs: 0, where: 'worker' });
    await vi.waitFor(() => expect(onState).toHaveBeenCalledTimes(1));
    expect(onState).toHaveBeenCalledWith('ready');
    expect(host.__ezdraftWorkerProbe).toBeDefined();

    const first = host.__ezdraftWorkerProbe!.run();
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenNthCalledWith(2, 'probe-room-areas', { minMs: 500 });
    job1.resolve({ rooms: 720, passes: 7, ranMs: 500.5, where: 'worker' });
    expect(await first).toEqual({
      rooms: 720,
      passes: 7,
      ranMs: 500.5,
      where: 'worker',
      jobMs: 500,
    });

    const second = host.__ezdraftWorkerProbe!.run();
    job2.reject(new Error('worker.crashed'));
    await expect(second).rejects.toThrow('worker.crashed');

    stop();
    stop();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect('__ezdraftWorkerProbe' in host).toBe(false);
  });

  it('EZD-235b V2 a failed warm-up sets failed, and a stop before the warm-up sets nothing', async () => {
    const warm1 = deferred();
    const p1 = fakePool([warm1]);
    const host1: ProbeHost = {};
    const onState1 = vi.fn();
    startProbeSession({ pool: p1.pool, host: host1, onState: onState1 });
    warm1.reject(new Error('worker.start_failed'));
    await vi.waitFor(() => expect(onState1).toHaveBeenCalledTimes(1));
    expect(onState1).toHaveBeenCalledWith('failed');
    expect(host1.__ezdraftWorkerProbe).toBeUndefined();

    const warm2 = deferred();
    const p2 = fakePool([warm2]);
    const host2: ProbeHost = {};
    const onState2 = vi.fn();
    const stop2 = startProbeSession({ pool: p2.pool, host: host2, onState: onState2 });
    stop2();
    warm2.resolve({ rooms: 720, passes: 1, ranMs: 0, where: 'worker' });
    await warm2.promise;
    await vi.waitFor(() => expect(p2.dispose).toHaveBeenCalledTimes(1));
    await flush();
    expect(onState2).not.toHaveBeenCalled();
    expect(host2.__ezdraftWorkerProbe).toBeUndefined();
    expect(p2.dispose).toHaveBeenCalledTimes(1);
  });
});

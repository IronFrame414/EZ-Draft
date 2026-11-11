// EZD-235b P1-P9 (vault/plans/EZD-235b.md section 4; AC-EZD-235-3): the worker pool on fake workers.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { serveJobs, type JobRequest, type JobScope } from '../../workers/serve-jobs';
import {
  MAX_POOL_WORKERS,
  createWorkerPool,
  defaultPoolSize,
  type PoolWorker,
} from './worker-pool';

function fakeWorker() {
  const posted: Array<[JobRequest, Transferable[]]> = [];
  let ended = 0;
  const worker = {
    postMessage(message: JobRequest, transfer: Transferable[]) {
      posted.push([message, transfer]);
    },
    terminate() {
      ended += 1;
    },
    onmessage: null as ((e: { data: unknown }) => void) | null,
    onerror: null as ((e: unknown) => void) | null,
    onmessageerror: null as ((e: unknown) => void) | null,
  };
  return {
    worker: worker as unknown as PoolWorker,
    raw: worker,
    posted,
    terminated: () => ended,
    reply(data: unknown) {
      worker.onmessage?.({ data });
    },
    crash(event: unknown) {
      worker.onerror?.(event);
    },
    messageError(event: unknown) {
      worker.onmessageerror?.(event);
    },
  };
}
type Fake = ReturnType<typeof fakeWorker>;

type Settled = { ok: true; v: unknown } | { ok: false; e: Error };
const track = (p: Promise<unknown>): Promise<Settled> =>
  p.then(
    (v) => ({ ok: true as const, v }),
    (e: Error) => ({ ok: false as const, e }),
  );
const rejected = (s: Settled): string => {
  if (s.ok) throw new Error('expected a rejection');
  return s.e.message;
};

describe('EZD-235b worker pool', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock('../../lib/errors/capture');
  });

  it('EZD-235b P1 the pool starts workers on first run, caps them and queues first in first out', async () => {
    const f1 = fakeWorker();
    const f2 = fakeWorker();
    const fakes = [f1, f2];
    let i = 0;
    const create = vi.fn(() => fakes[i++]!.worker);
    const pool = createWorkerPool({ create, size: 2 });
    expect(create).toHaveBeenCalledTimes(0);
    const buf = new ArrayBuffer(8);
    const A = track(pool.run('k', 1));
    const B = track(pool.run('k', 2, [buf]));
    const C = track(pool.run('k', 3));
    void B;
    void C;
    expect(create).toHaveBeenCalledTimes(2);
    expect(pool.stats()).toEqual({ started: 2, busy: 2, queued: 1, done: 0, failed: 0 });
    expect(f1.posted[0]).toEqual([{ id: 1, kind: 'k', input: 1 }, []]);
    expect(f2.posted[0]![0]).toEqual({ id: 2, kind: 'k', input: 2 });
    expect(f2.posted[0]![1]).toEqual([buf]);
    expect(f2.posted[0]![1][0]).toBe(buf);
    f1.reply({ id: 1, ok: true, output: 'out-1' });
    expect(await A).toEqual({ ok: true, v: 'out-1' });
    expect(f1.posted[1]![0]).toEqual({ id: 3, kind: 'k', input: 3 });
    expect(pool.stats()).toEqual({ started: 2, busy: 2, queued: 0, done: 1, failed: 0 });
  });

  it('EZD-235b P2 replies resolve or reject the running job and stray replies are ignored', async () => {
    const f1 = fakeWorker();
    const create = vi.fn(() => f1.worker);
    const pool = createWorkerPool({ create, size: 1 });
    const A = track(pool.run('k', 1));
    f1.reply({ id: 99, ok: true, output: 'x' });
    f1.reply('garbage');
    expect(pool.stats().busy).toBe(1);
    f1.reply({ id: 1, ok: false, error: 'worker.job_failed' });
    expect(rejected(await A)).toBe('worker.job_failed');

    const B = track(pool.run('k', 2));
    f1.reply({ id: 2, ok: false, error: 'other' });
    expect(rejected(await B)).toBe('worker.job_failed');

    const C = track(pool.run('k', 3));
    f1.reply({ id: 3, ok: false, error: 'worker.unknown_job' });
    expect(rejected(await C)).toBe('worker.unknown_job');

    const D = track(pool.run('k', 4));
    f1.reply({ id: 4 });
    expect(rejected(await D)).toBe('worker.bad_reply');

    const E = track(pool.run('k', 5));
    f1.messageError({});
    expect(rejected(await E)).toBe('worker.bad_reply');

    f1.messageError({});
    const F = track(pool.run('k', 6));
    f1.reply({ id: 6, ok: true, output: 6 });
    expect(await F).toEqual({ ok: true, v: 6 });

    expect(create).toHaveBeenCalledTimes(1);
    expect(f1.terminated()).toBe(0);
    expect(pool.stats()).toEqual({ started: 1, busy: 0, queued: 0, done: 1, failed: 5 });
  });

  it('EZD-235b P3 a crashed worker fails its job, is ended and reported once, and the next job gets a new worker', async () => {
    const [f1, f2, f3, f4] = [fakeWorker(), fakeWorker(), fakeWorker(), fakeWorker()];
    const fakes = [f1, f2, f3, f4];
    let i = 0;
    const create = vi.fn(() => fakes[i++]!.worker);
    const report = vi.fn();
    const pool = createWorkerPool({ create, size: 1, report });
    const evt = { tag: 'evt' };
    const evt2 = { tag: 'evt2' };
    const evt3 = { tag: 'evt3' };

    const A = track(pool.run('k', 1));
    const B = track(pool.run('k', 2));
    f1.crash(evt);
    expect(rejected(await A)).toBe('worker.crashed');
    expect(f1.terminated()).toBe(1);
    expect(report).toHaveBeenCalledTimes(1);
    const first = report.mock.calls[0]![0] as Error;
    expect(first).toBeInstanceOf(Error);
    expect(first.message).toBe('worker.crashed');
    expect(first.cause).toBe(evt);

    f1.crash(evt);
    expect(report).toHaveBeenCalledTimes(1);
    expect(f1.terminated()).toBe(1);

    expect(f2.posted[0]![0]).toEqual({ id: 2, kind: 'k', input: 2 });
    f2.crash(evt2);
    expect(rejected(await B)).toBe('worker.crashed');
    expect(report).toHaveBeenCalledTimes(2);

    const C = track(pool.run('k', 3));
    expect(f3.posted[0]![0]).toEqual({ id: 3, kind: 'k', input: 3 });
    f3.reply({ id: 3, ok: true, output: 3 });
    expect(await C).toEqual({ ok: true, v: 3 });

    f3.crash(evt3);
    expect(report).toHaveBeenCalledTimes(3);
    expect((report.mock.calls[2]![0] as Error).cause).toBe(evt3);
    expect(f3.terminated()).toBe(1);

    void track(pool.run('k', 4));
    expect(f4.posted[0]![0]).toEqual({ id: 4, kind: 'k', input: 4 });
    expect(pool.stats()).toMatchObject({ started: 4, done: 1, failed: 2 });
  });

  it('EZD-235b P4 dispose ends every worker and fails running, queued and later jobs', async () => {
    const f1 = fakeWorker();
    const create = vi.fn(() => f1.worker);
    const pool = createWorkerPool({ create, size: 1 });
    const A = track(pool.run('k', 1));
    const B = track(pool.run('k', 2));
    pool.dispose();
    const C = track(pool.run('k', 3));
    pool.dispose();
    expect(rejected(await A)).toBe('worker.disposed');
    expect(rejected(await B)).toBe('worker.disposed');
    expect(rejected(await C)).toBe('worker.disposed');
    expect(f1.terminated()).toBe(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(pool.stats()).toEqual({ started: 1, busy: 0, queued: 0, done: 0, failed: 3 });
  });

  it('EZD-235b P5 pool size: the default from the processor count and refused sizes', () => {
    expect(MAX_POOL_WORKERS).toBe(4);
    const inputs = [undefined, NaN, Infinity, 0, -3, 1, 2, 2.9, 4, 5, 8, 16];
    expect(inputs.map((n) => defaultPoolSize(n))).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 3, 4, 4, 4]);

    const create = vi.fn(() => fakeWorker().worker);
    for (const size of [0, 5, 1.5, NaN, -1]) {
      expect(() => createWorkerPool({ create, size })).toThrow(RangeError);
      expect(() => createWorkerPool({ create, size })).toThrow('pool_size');
    }
    expect(() => createWorkerPool({ create, size: 4 })).not.toThrow();

    vi.stubGlobal('navigator', { hardwareConcurrency: 3 });
    const f1 = fakeWorker();
    const f2 = fakeWorker();
    const fakes = [f1, f2];
    let i = 0;
    const create2 = vi.fn(() => fakes[i++]!.worker);
    const pool = createWorkerPool({ create: create2 });
    void track(pool.run('k', 1));
    void track(pool.run('k', 2));
    void track(pool.run('k', 3));
    expect(create2).toHaveBeenCalledTimes(2);
    expect(pool.stats()).toMatchObject({ busy: 2, queued: 1 });
  });

  it('EZD-235b P6 a worker that fails to start or a post that throws fails only that job', async () => {
    const f1 = fakeWorker();
    let n = 0;
    const create = vi.fn(() => {
      n += 1;
      if (n === 1) throw new Error('boom');
      return f1.worker;
    });
    const report = vi.fn();
    const pool = createWorkerPool({ create, size: 1, report });

    const A = await track(pool.run('k', 1));
    expect(rejected(A)).toBe('worker.start_failed');
    expect(((A as { e: Error }).e.cause as Error).message).toBe('boom');
    expect(report).toHaveBeenCalledTimes(1);
    expect((report.mock.calls[0]![0] as Error).message).toBe('worker.start_failed');
    expect(((report.mock.calls[0]![0] as Error).cause as Error).message).toBe('boom');

    const B = track(pool.run('k', 2));
    expect(f1.posted[0]![0]).toEqual({ id: 2, kind: 'k', input: 2 });
    f1.reply({ id: 2, ok: true, output: 2 });
    expect(await B).toEqual({ ok: true, v: 2 });

    const original = f1.raw.postMessage;
    f1.raw.postMessage = () => {
      f1.raw.postMessage = original;
      throw new Error('clone');
    };
    const C = await track(pool.run('k', 3));
    expect(rejected(C)).toBe('worker.bad_input');
    expect(((C as { e: Error }).e.cause as Error).message).toBe('clone');
    expect(report).toHaveBeenCalledTimes(1);

    void track(pool.run('k', 4));
    expect(f1.posted.map((p) => p[0].id)).toEqual([2, 4]);
    expect(pool.stats()).toMatchObject({ started: 1, failed: 2 });
  });

  it('EZD-235b P7 the pool runs jobs end to end over serveJobs', async () => {
    const scope: JobScope = {
      onmessage: null,
      postMessage: (reply) => {
        worker.onmessage?.({ data: reply });
      },
    };
    const worker = {
      postMessage: (m: unknown) => {
        queueMicrotask(() => scope.onmessage?.({ data: m }));
      },
      terminate: () => {},
      onmessage: null as ((e: { data: unknown }) => void) | null,
      onerror: null,
      onmessageerror: null,
    };
    serveJobs(scope, { a: (x) => (x as number) * 2 });
    const pool = createWorkerPool({ create: () => worker as unknown as PoolWorker, size: 1 });
    expect(await pool.run('a', 21)).toBe(42);
    await expect(pool.run('zz', 1)).rejects.toThrow('worker.unknown_job');
  });

  it('EZD-235b P8 a queued job whose new worker fails to start fails alone and the next queued job retries', async () => {
    const f1 = fakeWorker();
    const f2 = fakeWorker();
    let n = 0;
    const create = vi.fn(() => {
      n += 1;
      if (n === 1) return f1.worker;
      if (n === 2) throw new Error('boom');
      return f2.worker;
    });
    const report = vi.fn();
    const pool = createWorkerPool({ create, size: 1, report });
    const A = track(pool.run('k', 1));
    const B = track(pool.run('k', 2));
    void track(pool.run('k', 3));
    f1.crash({ tag: 'evt' });
    expect(rejected(await A)).toBe('worker.crashed');
    const b = await B;
    expect(rejected(b)).toBe('worker.start_failed');
    expect(((b as { e: Error }).e.cause as Error).message).toBe('boom');
    expect(f2.posted[0]![0]).toEqual({ id: 3, kind: 'k', input: 3 });
    expect(create).toHaveBeenCalledTimes(3);
    expect(report).toHaveBeenCalledTimes(2);
    expect(report.mock.calls.map((c) => (c[0] as Error).message)).toEqual([
      'worker.crashed',
      'worker.start_failed',
    ]);
    expect(pool.stats()).toMatchObject({ started: 2, busy: 1, queued: 0, failed: 2 });
  });

  it('EZD-235b P9 the default report sends a crash to Sentry at editor.worker_pool', async () => {
    // (a) the capture module loads: the crash reaches it with the location tag.
    vi.resetModules();
    const spy = vi.fn();
    vi.doMock('../../lib/errors/capture', () => ({ captureBrowserError: spy }));
    const a = await import('./worker-pool');
    const fa: Fake = fakeWorker();
    const poolA = a.createWorkerPool({ create: () => fa.worker, size: 1 });
    const A = track(poolA.run('k', 1));
    fa.crash({ tag: 'evt' });
    expect(rejected(await A)).toBe('worker.crashed');
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect((spy.mock.calls[0]![0] as Error).message).toBe('worker.crashed');
    expect(spy.mock.calls[0]![1]).toBe('editor.worker_pool');

    // (b) the capture module fails to load: nothing is left unhandled.
    vi.resetModules();
    vi.doMock('../../lib/errors/capture', () => {
      throw new Error('load');
    });
    const b = await import('./worker-pool');
    const fb: Fake = fakeWorker();
    const poolB = b.createWorkerPool({ create: () => fb.worker, size: 1 });
    const B = track(poolB.run('k', 1));
    fb.crash({ tag: 'evt' });
    expect(rejected(await B)).toBe('worker.crashed');
    await vi.dynamicImportSettled();
  });
});

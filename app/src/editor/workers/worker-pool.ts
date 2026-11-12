// EZD-235b Build step 2 (vault/plans/EZD-235b.md): the Web Worker pool, one job per worker, workers made on demand.
import type { JobRequest } from '../../workers/serve-jobs';

export type PoolWorker = Pick<
  Worker,
  'postMessage' | 'terminate' | 'onmessage' | 'onerror' | 'onmessageerror'
>;

export type WorkerPoolStats = {
  started: number;
  busy: number;
  queued: number;
  done: number;
  failed: number;
};

export type WorkerPool = {
  run<O = unknown>(kind: string, input: unknown, transfer?: Transferable[]): Promise<O>;
  stats(): WorkerPoolStats;
  dispose(): void;
};

export const MAX_POOL_WORKERS = 4;

export function defaultPoolSize(hardwareConcurrency: number | undefined): number {
  if (typeof hardwareConcurrency !== 'number' || !Number.isFinite(hardwareConcurrency)) return 1;
  return Math.min(MAX_POOL_WORKERS, Math.max(1, Math.floor(hardwareConcurrency) - 1));
}

async function reportDefault(error: unknown): Promise<void> {
  try {
    const { captureBrowserError } = await import('../../lib/errors/capture');
    captureBrowserError(error, 'editor.worker_pool');
  } catch {
    // A reporter that cannot load cannot report itself; the pool's state is already settled (D-Report).
  }
}

type Job = {
  request: JobRequest;
  transfer: Transferable[];
  resolve: (output: unknown) => void;
  reject: (error: Error) => void;
};

type Slot = { worker: PoolWorker; job: Job | null };

export function createWorkerPool(o: {
  create: () => PoolWorker;
  size?: number;
  report?: (error: unknown) => void;
}): WorkerPool {
  const size = o.size ?? defaultPoolSize(globalThis.navigator?.hardwareConcurrency);
  if (!Number.isInteger(size) || size < 1 || size > MAX_POOL_WORKERS)
    throw new RangeError('pool_size');
  const report = o.report ?? ((error: unknown) => void reportDefault(error));

  const slots: Slot[] = [];
  const queue: Job[] = [];
  let nextId = 1;
  let disposed = false;
  let started = 0;
  let done = 0;
  let failed = 0;

  const succeed = (job: Job, output: unknown) => {
    done += 1;
    job.resolve(output);
  };
  const fail = (job: Job, error: Error) => {
    failed += 1;
    job.reject(error);
  };

  const detach = (worker: PoolWorker) => {
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    worker.terminate();
  };

  // Settles the slot's running job, frees the slot and gives it the queue head.
  const finish = (slot: Slot, settle: (job: Job) => void) => {
    const job = slot.job;
    if (job === null) return;
    slot.job = null;
    settle(job);
    pump();
  };

  const onReply = (slot: Slot, data: unknown) => {
    const job = slot.job;
    if (job === null || typeof data !== 'object' || data === null) return;
    const reply = data as { id?: unknown; ok?: unknown; output?: unknown; error?: unknown };
    if (reply.id !== job.request.id) return;
    if (reply.ok === true) finish(slot, (j) => succeed(j, reply.output));
    else if (reply.ok === false)
      finish(slot, (j) =>
        fail(
          j,
          new Error(
            reply.error === 'worker.unknown_job' ? 'worker.unknown_job' : 'worker.job_failed',
          ),
        ),
      );
    else finish(slot, (j) => fail(j, new Error('worker.bad_reply')));
  };

  const onCrash = (slot: Slot, event: unknown) => {
    const index = slots.indexOf(slot);
    if (index === -1) return;
    slots.splice(index, 1);
    const job = slot.job;
    slot.job = null;
    if (job !== null) fail(job, new Error('worker.crashed'));
    detach(slot.worker);
    report(new Error('worker.crashed', { cause: event }));
    pump();
  };

  // A new worker wired to its slot, or the error `create` threw.
  const startWorker = (): { ok: true; slot: Slot } | { ok: false; thrown: unknown } => {
    let worker: PoolWorker;
    try {
      worker = o.create();
    } catch (thrown) {
      return { ok: false, thrown };
    }
    started += 1;
    const slot: Slot = { worker, job: null };
    worker.onmessage = (event) => onReply(slot, event.data);
    worker.onmessageerror = () => finish(slot, (j) => fail(j, new Error('worker.bad_reply')));
    worker.onerror = (event) => onCrash(slot, event);
    slots.push(slot);
    return { ok: true, slot };
  };

  // Posts the job on the slot's worker; a post that throws fails that job only and leaves the worker idle.
  const post = (slot: Slot, job: Job): void => {
    slot.job = job;
    try {
      slot.worker.postMessage(job.request, job.transfer);
    } catch (thrown) {
      slot.job = null;
      fail(job, new Error('worker.bad_input', { cause: thrown }));
    }
  };

  // Gives queued jobs to idle workers, or to new workers while fewer than `size` are alive.
  function pump(): void {
    while (!disposed && queue.length > 0) {
      let slot = slots.find((s) => s.job === null);
      if (slot === undefined) {
        if (slots.length >= size) return;
        const start = startWorker();
        if (!start.ok) {
          const error = new Error('worker.start_failed', { cause: start.thrown });
          fail(queue.shift()!, error);
          report(error);
          continue;
        }
        slot = start.slot;
      }
      post(slot, queue.shift()!);
    }
  }

  return {
    run<O = unknown>(kind: string, input: unknown, transfer?: Transferable[]): Promise<O> {
      if (disposed) {
        failed += 1;
        return Promise.reject(new Error('worker.disposed'));
      }
      return new Promise<O>((resolve, reject) => {
        queue.push({
          request: { id: nextId++, kind, input },
          transfer: transfer ?? [],
          resolve: (output) => resolve(output as O),
          reject,
        });
        pump();
      });
    },
    stats(): WorkerPoolStats {
      return {
        started,
        busy: slots.filter((s) => s.job !== null).length,
        queued: queue.length,
        done,
        failed,
      };
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      const running = slots.flatMap((s) => (s.job === null ? [] : [s.job]));
      for (const slot of slots) {
        slot.job = null;
        detach(slot.worker);
      }
      slots.length = 0;
      const waiting = queue.splice(0, queue.length);
      for (const job of [...running, ...waiting]) fail(job, new Error('worker.disposed'));
    },
  };
}

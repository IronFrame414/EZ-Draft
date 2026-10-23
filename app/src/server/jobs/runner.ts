// EZD-009 Step 5 (vault/plans/EZD-009.md): one run of the job runner, started by enqueue (after()) and by
// the once-a-minute sweep. It fails jobs whose last try died, then claims and runs due jobs one at a time
// until the run's time budget is nearly spent. Every write after a claim is fenced by run_id (Step 2): a
// false answer means the lease was lost, and nothing more is written for that job. It never throws.
import type { JobKind } from '../../lib/jobs/kinds';
import { createJobsDbClient } from './db';
import { defaultRunnerConfig, jobBackoffMs, type RunnerConfig } from './config';
import { JobError } from './errors';
import { getHandlers } from './handlers';
import { createJobQueue, type JobQueue } from './queue';
import type { AnyJobHandler, JobContext, JobHandlers, JobRow } from './registry';
import { assertPathsInJob } from './storage-path';

export type Clock = { now(): number; sleep(ms: number): Promise<void> };

export type RunJobsOptions = {
  queue?: JobQueue;
  handlers?: JobHandlers;
  config?: Partial<RunnerConfig>;
  clock?: Clock;
  onlyTenantId?: string;
  onJobFailed?: (job: JobRow) => void | Promise<void>;
};

export type RunSummary = {
  claimed: number;
  done: number;
  continued: number;
  retried: number;
  failed: number;
  leaseLost: number;
};

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export async function runJobs(options: RunJobsOptions = {}): Promise<RunSummary> {
  const summary: RunSummary = {
    claimed: 0,
    done: 0,
    continued: 0,
    retried: 0,
    failed: 0,
    leaseLost: 0,
  };
  const config: RunnerConfig = { ...defaultRunnerConfig(), ...options.config };
  const clock = options.clock ?? realClock;
  const deadline = clock.now() + config.runBudgetMs;
  const reportFailed = async (job: JobRow) => {
    try {
      await options.onJobFailed?.(job);
    } catch {
      // A failing report never stops the run.
    }
  };

  let queue: JobQueue;
  let handlers: JobHandlers;
  try {
    queue = options.queue ?? createJobQueue(createJobsDbClient());
    handlers = options.handlers ?? getHandlers();
  } catch {
    return summary;
  }

  try {
    const expired = await queue.failExpired(options.onlyTenantId);
    for (const job of expired) {
      summary.failed += 1;
      await reportFailed(job);
    }
  } catch {
    return summary;
  }

  while (deadline - clock.now() >= config.minClaimMs) {
    const runId = crypto.randomUUID();
    let job: JobRow | null;
    try {
      job = await queue.claim(runId, config.leaseSeconds, options.onlyTenantId);
    } catch {
      break;
    }
    if (!job) break;
    summary.claimed += 1;
    try {
      await runOne(job, runId, handlers[job.kind as JobKind]);
    } catch {
      // A write error leaves the job to its lease: it is picked up again when the lease expires.
    }
  }
  return summary;

  async function runOne(job: JobRow, runId: string, handler: AnyJobHandler | undefined) {
    const controller = new AbortController();
    const write = async (op: () => Promise<boolean>): Promise<boolean> => {
      if (controller.signal.aborted) return false;
      const ok = await op();
      if (!ok) controller.abort();
      return ok;
    };

    const failJob = async (code: string, retry: boolean) => {
      const retryAfterMs =
        retry && job.attempts < job.max_attempts
          ? jobBackoffMs(job.attempts, config.backoff)
          : null;
      if (!(await write(() => queue.fail(job.id, runId, code, retryAfterMs)))) {
        summary.leaseLost += 1;
        return;
      }
      if (retryAfterMs !== null) {
        summary.retried += 1;
        return;
      }
      summary.failed += 1;
      await reportFailed({
        ...job,
        status: 'failed',
        error: code,
        run_id: null,
        lease_expires_at: null,
      });
    };

    if (!handler) return failJob('no_handler', false);

    const payload = handler.payload.safeParse(job.payload);
    const state =
      job.state === null || !handler.state
        ? { success: true as const, data: job.state }
        : handler.state.safeParse(job.state);
    if (!payload.success || !state.success) return failJob('invalid_payload', false);
    try {
      assertPathsInJob(job.payload, job);
    } catch {
      return failJob('invalid_payload', false);
    }

    let lastProgress = job.progress;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- payload and state reach the handler parsed
    const { payload: _p, state: _s, ...jobFields } = job;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the handler map holds every shape
    const ctx: JobContext<any, any> = {
      job: jobFields,
      payload: payload.data,
      state: state.data ?? null,
      progress: async (pct) => {
        const value = Math.round(pct);
        if (value === lastProgress) return;
        if (await write(() => queue.progress(job.id, runId, value))) lastProgress = value;
      },
      timeLeft: () => deadline - clock.now(),
      sleep: (ms) => clock.sleep(ms),
      signal: controller.signal,
    };

    let outcome: Awaited<ReturnType<AnyJobHandler['run']>>;
    try {
      outcome = await handler.run(ctx);
    } catch (e) {
      if (controller.signal.aborted) {
        summary.leaseLost += 1;
        return;
      }
      if (e instanceof JobError) return failJob(e.code, e.retry);
      return failJob('handler_failed', true);
    }
    if (controller.signal.aborted) {
      summary.leaseLost += 1;
      return;
    }

    if ('done' in outcome) {
      const result = handler.result.safeParse(outcome.done);
      if (!result.success) return failJob('invalid_result', false);
      try {
        assertPathsInJob(result.data, job);
      } catch {
        return failJob('invalid_result', false);
      }
      if (await write(() => queue.complete(job.id, runId, result.data))) summary.done += 1;
      else summary.leaseLost += 1;
      return;
    }
    if (await write(() => queue.continueJob(job.id, runId, outcome.continue))) {
      summary.continued += 1;
    } else {
      summary.leaseLost += 1;
    }
  }
}

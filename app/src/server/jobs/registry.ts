// EZD-009 Step 5 (vault/plans/EZD-009.md): the handler contract (types only). Handlers are safe to run twice
// (Step 4): output paths are fixed by job id, and outside calls carry an idempotency key from the job id
// and the cursor. A handler runs with the secret key, so it filters every query by ctx.job.tenant_id.
import type { ZodType } from 'zod';
import type { JobKind } from '../../lib/jobs/kinds';
import type { Database } from '../db/database.types';

export type JobRow = Database['public']['Tables']['job']['Row'];

export type JobContext<P, S> = {
  job: Omit<JobRow, 'payload' | 'state'>;
  payload: P;
  state: S | null;
  progress(pct: number): Promise<void>;
  timeLeft(): number;
  sleep(ms: number): Promise<void>;
  signal: AbortSignal;
};

export type JobOutcome<S, R> = { done: R } | { continue: S };

export type JobHandler<P, S, R> = {
  kind: JobKind;
  payload: ZodType<P>;
  state?: ZodType<S>;
  result: ZodType<R>;
  maxAttempts?: number;
  run(ctx: JobContext<P, S>): Promise<JobOutcome<S, R>>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the map holds handlers of every shape
export type AnyJobHandler = JobHandler<any, any, any>;

export type JobHandlers = Partial<Record<JobKind, AnyJobHandler>>;

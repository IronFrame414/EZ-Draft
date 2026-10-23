// EZD-009 Step 5 (vault/plans/EZD-009.md): one rpc call per queue function (Step 2). Pass the secret-key
// client from createJobsDbClient(). An rpc error is thrown unchanged; the runner catches it.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../db/database.types';
import type { JobRow } from './registry';

export type JobQueue = {
  failExpired(onlyTenantId?: string): Promise<JobRow[]>;
  claim(runId: string, leaseSeconds: number, onlyTenantId?: string): Promise<JobRow | null>;
  progress(jobId: string, runId: string, progress: number): Promise<boolean>;
  complete(jobId: string, runId: string, result: unknown): Promise<boolean>;
  continueJob(jobId: string, runId: string, state: unknown): Promise<boolean>;
  fail(jobId: string, runId: string, error: string, retryAfterMs: number | null): Promise<boolean>;
};

export function createJobQueue(db: SupabaseClient<Database>): JobQueue {
  // p_only_tenant and p_retry_after_ms take null; the generated argument types do not say so.
  const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const call = db.rpc.bind(db) as unknown as (
      f: string,
      a: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: unknown }>;
    const { data, error } = await call(fn, args);
    if (error) throw error;
    return data as T;
  };

  return {
    failExpired: async (onlyTenantId) =>
      (await rpc<JobRow[] | null>('job_fail_expired', { p_only_tenant: onlyTenantId ?? null })) ??
      [],
    claim: async (runId, leaseSeconds, onlyTenantId) => {
      const rows = await rpc<JobRow[] | null>('job_claim', {
        p_run_id: runId,
        p_lease_seconds: leaseSeconds,
        p_only_tenant: onlyTenantId ?? null,
      });
      return rows?.[0] ?? null;
    },
    progress: (jobId, runId, progress) =>
      rpc<boolean>('job_progress', { p_job_id: jobId, p_run_id: runId, p_progress: progress }),
    complete: (jobId, runId, result) =>
      rpc<boolean>('job_complete', {
        p_job_id: jobId,
        p_run_id: runId,
        p_result: result as Json,
      }),
    continueJob: (jobId, runId, state) =>
      rpc<boolean>('job_continue', { p_job_id: jobId, p_run_id: runId, p_state: state as Json }),
    fail: (jobId, runId, error, retryAfterMs) =>
      rpc<boolean>('job_fail', {
        p_job_id: jobId,
        p_run_id: runId,
        p_error: error,
        p_retry_after_ms: retryAfterMs,
      }),
  };
}

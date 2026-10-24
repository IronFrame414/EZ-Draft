// EZD-009 Step 5 (vault/plans/EZD-009.md): add a job under the caller's session client (03 rule 1: RLS and
// enqueue_job's own tenant and scope checks stay the backstop), then start a run after the response. The
// calling route checks permissions with can() (EZD-102 / EZD-133). The tenant prefix of Storage paths is
// rechecked by the runner, which knows the tenant id.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { JobKind } from '../../lib/jobs/kinds';
import type { Database, Json } from '../db/database.types';
import { defaultRunnerConfig } from './config';
import { JobError } from './errors';
import { getHandlers } from './handlers';
import { kickJobRunner } from './kick';
import { assertPathsWellFormed } from './storage-path';

const MAX_PAYLOAD_BYTES = 16384;

export async function enqueueJob(
  db: SupabaseClient<Database>,
  input: { kind: JobKind; projectId: string | null; payload: unknown; runAfter?: Date },
  options: { kick?: () => void } = {},
): Promise<{ id: string }> {
  const kick = options.kick ?? kickJobRunner;
  const handler = getHandlers()[input.kind];
  if (!handler) throw new JobError('no_handler', { retry: false });

  const parsed = handler.payload.safeParse(input.payload);
  if (!parsed.success) throw new JobError('invalid_payload', { retry: false });
  if (Buffer.byteLength(JSON.stringify(input.payload), 'utf8') > MAX_PAYLOAD_BYTES) {
    throw new JobError('invalid_payload', { retry: false });
  }
  try {
    assertPathsWellFormed(input.payload);
  } catch {
    throw new JobError('invalid_payload', { retry: false });
  }

  // p_project_id takes null for a tenant-level job; the generated argument types do not say so.
  const args = {
    p_kind: input.kind,
    p_project_id: input.projectId as string,
    p_payload: input.payload as Json,
    p_max_attempts: handler.maxAttempts ?? defaultRunnerConfig().maxAttemptsDefault,
    ...(input.runAfter ? { p_run_after: input.runAfter.toISOString() } : {}),
  };
  const { data, error } = await db.rpc('enqueue_job', args);
  if (error) throw error;
  kick();
  return { id: data };
}

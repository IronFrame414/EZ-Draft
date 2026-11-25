// EZD-1408 (S22 Draft tasks with AI; 02 Stack AI "task drafts"): the field_task_draft job. The payload names the
// project; the job's company scopes every read and write (field-task-draft-run.ts). One Claude call per run
// through the EZD-021 client; AiError retry stops a failure a later try cannot fix. Safe to run twice: the run
// replaces the project's draft rows, so a second run leaves the same rows. The result holds counts only.
// The payload's project must be the job's own project (enqueue_job checks the caller's scope for that one), and
// the member who queued it must still hold Edit field tasks (S22 Permissions: drafting needs it); enqueue_job
// takes any kind from any member, so the handler checks before it reads or spends anything.
import { z } from 'zod';
import { draftFieldTasks, type DraftResult } from './field-task-draft-run';
import { createJobsDbClient } from '../db';
import { JobError } from '../errors';
import type { JobHandler } from '../registry';

type JobsDb = ReturnType<typeof createJobsDbClient>;

// The creator's active membership in the job's company grants Edit field tasks.
async function creatorMayDraft(db: JobsDb, tenantId: string, userId: string | null) {
  if (userId === null) return false;
  const member = await db
    .from('membership')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (member.error) throw member.error;
  if (member.data === null) return false;
  const grant = await db
    .from('user_permission')
    .select('permission_key')
    .eq('tenant_id', tenantId)
    .eq('membership_id', member.data.id)
    .eq('permission_key', 'edit_field_tasks')
    .eq('granted', true)
    .maybeSingle();
  if (grant.error) throw grant.error;
  return grant.data !== null;
}

export type FieldTaskDraftPayload = { projectId: string };

export const fieldTaskDraftHandler: JobHandler<FieldTaskDraftPayload, never, DraftResult> = {
  kind: 'field_task_draft',
  payload: z.object({ projectId: z.uuid() }),
  result: z.object({ projectId: z.string(), rooms: z.number().int(), tasks: z.number().int() }),
  async run(ctx) {
    if (ctx.job.project_id !== ctx.payload.projectId)
      throw new JobError('field_task_draft_project_mismatch', { retry: false });
    const db = createJobsDbClient();
    if (!(await creatorMayDraft(db, ctx.job.tenant_id, ctx.job.created_by ?? null)))
      throw new JobError('permission_denied', { retry: false });
    const result = await draftFieldTasks(db, ctx, ctx.payload.projectId);
    return { done: result };
  },
};

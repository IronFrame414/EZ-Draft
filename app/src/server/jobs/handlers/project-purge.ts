// EZD-124 (Q-0201 "storage is freed at once"; Q-0700 decisions 03 "Project Delete"): the company-level purge job
// that delete_project queues. With the secret key it removes every object under <tenant>/<project>/ in the five
// buckets (sources, renders, exports, media, jobs), sent files included: the sent-file trigger lets those deletes
// through once the project row is gone. list_project_purge_files lists nothing while the project row exists, so a
// crafted payload never removes a live project's files. A batch at a time; safe to run twice (a second run finds
// nothing and gives the same result).
import { z } from 'zod';
import { createJobsDbClient } from '../db';
import type { JobHandler } from '../registry';

export const PROJECT_PURGE_BATCH = 1000;
// The time a batch is allowed, so a slice that cannot fit another stops with a cursor.
const BATCH_MS = 5000;

export type ProjectPurgePayload = { projectId: string };

export const projectPurgeHandler: JobHandler<
  ProjectPurgePayload,
  Record<string, never>,
  { projectId: string }
> = {
  kind: 'project_purge',
  payload: z.object({ projectId: z.uuid() }),
  state: z.object({}).strict() as never,
  result: z.object({ projectId: z.string() }),
  maxAttempts: 5,
  async run(ctx) {
    const db = createJobsDbClient();
    const { projectId } = ctx.payload;
    for (let batch = 0; ; batch++) {
      if (batch > 0 && ctx.timeLeft() < BATCH_MS) return { continue: {} };
      const { data, error } = await db.rpc('list_project_purge_files', {
        p_tenant: ctx.job.tenant_id,
        p_project: projectId,
        p_limit: PROJECT_PURGE_BATCH,
      });
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return { done: { projectId } };
      const byBucket = new Map<string, string[]>();
      for (const r of rows) byBucket.set(r.bucket_id, [...(byBucket.get(r.bucket_id) ?? []), r.name]);
      for (const [bucket, names] of byBucket) {
        const removed = await db.storage.from(bucket).remove(names);
        if (removed.error) throw removed.error;
      }
    }
  },
};

// EZD-123 (Q-0700 03 "Daily cleanup"; Q-0708; R24 #4; AC-EZD-123-1, -3, -7, -8): the daily version cleanup of one
// company, queued by the sweep (enqueue_version_cleanup) once a day per company. `at` is the day's run time, so a
// retry runs against the same clock. With `dryRun` it lists the version ids it would delete and stamp and writes
// nothing. Safe to run twice: the second run with the same `at` finds nothing to delete or stamp, and the result
// is the run time either way (a dry run's lists are the same both times).
import { z } from 'zod';
import { runVersionCleanupWith } from '../../versions/cleanup';
import { createJobsDbClient } from '../db';
import type { JobHandler } from '../registry';

// Ids kept in a dry run's result (the job result is limited to 16 KB).
export const CLEANUP_RESULT_IDS = 150;

export type CleanupPayload = { at: string; dryRun?: boolean };
export type CleanupResult =
  | { at: string }
  | {
      at: string;
      dryRun: true;
      deleted: string[];
      due: string[];
      deletedCount: number;
      dueCount: number;
    };

export const cleanupHandler: JobHandler<CleanupPayload, Record<string, never>, CleanupResult> = {
  kind: 'cleanup',
  payload: z.object({ at: z.iso.datetime({ offset: true }), dryRun: z.boolean().optional() }),
  state: z.object({}).strict() as never,
  result: z.union([
    z.object({ at: z.string() }).strict(),
    z
      .object({
        at: z.string(),
        dryRun: z.literal(true),
        deleted: z.array(z.string()),
        due: z.array(z.string()),
        deletedCount: z.number().int(),
        dueCount: z.number().int(),
      })
      .strict(),
  ]),
  maxAttempts: 5,
  async run(ctx) {
    const { at, dryRun } = ctx.payload;
    const r = await runVersionCleanupWith(
      createJobsDbClient(),
      ctx.job.tenant_id,
      at,
      dryRun === true,
    );
    if (dryRun !== true) return { done: { at } };
    return {
      done: {
        at,
        dryRun: true,
        deleted: r.deleted.slice(0, CLEANUP_RESULT_IDS),
        due: r.due.slice(0, CLEANUP_RESULT_IDS),
        deletedCount: r.deleted.length,
        dueCount: r.due.length,
      },
    };
  },
};

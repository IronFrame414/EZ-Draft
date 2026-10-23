// EZD-024 Step 9 (vault/plans/EZD-024.md; Re-validation V5): the runner hooks every real run uses. A final
// failure emails the owner (reportJobFailure, with the runner's client, so service_role); a handler throw goes
// to Sentry only (alert: false), so one failing job never sends a "new error" email as well.
import { reportError, reportJobFailure } from '../errors/report';
import { createJobsDbClient } from './db';
import type { JobRow } from './registry';

export function defaultJobHooks() {
  return {
    onJobFailed: async (job: JobRow) => {
      await reportJobFailure(job, { db: createJobsDbClient() });
    },
    onHandlerError: async (job: JobRow, err: unknown) => {
      await reportError(err, {
        source: 'job',
        location: job.kind,
        tags: { 'ezd.job_id': job.id },
        alert: false,
      });
    },
  };
}

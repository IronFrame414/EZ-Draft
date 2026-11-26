// EZD-123 (Q-0700 03 "Daily cleanup"; ARCH Background jobs "Sweep"): the sweep's version cleanup pass, with the
// runner's secret-key client (enqueue_version_cleanup is service_role only). It queues the day's cleanup job per
// company once the day's run time has come; later sweeps that day queue nothing.
import { createJobsDbClient } from '../jobs/db';
import { enqueueVersionCleanupWith } from './cleanup';

export async function sweepVersionCleanup(): Promise<number> {
  return enqueueVersionCleanupWith(createJobsDbClient());
}

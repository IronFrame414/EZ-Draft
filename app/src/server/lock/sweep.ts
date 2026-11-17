// EZD-125 (Q-0697 decisions 03 "Auto release"; ARCH Background jobs "Sweep"): the sweep's edit lock pass, with
// the runner's secret-key client. Every lock whose pending request has passed its deadline is auto-released.
import { createJobsDbClient } from '../jobs/db';
import { sweepEditLocks } from './lock';

export async function sweepExpiredLocks(): Promise<number> {
  return sweepEditLocks(createJobsDbClient());
}

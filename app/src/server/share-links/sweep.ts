// EZD-1201 (07 share_link.expiring; ARCH Background jobs "Sweep"): the sweep's share link reminder pass, with the
// runner's secret-key client (sweep_share_link_reminders is service_role only).
import { createJobsDbClient } from '../jobs/db';
import { sweepShareLinkRemindersWith } from './share-links';

export async function sweepShareLinkReminders(): Promise<number> {
  return sweepShareLinkRemindersWith(createJobsDbClient());
}

// EZD-018 Step 5 (vault/plans/EZD-018.md): typed event maps for the project and user channels. A later
// ticket adds its event name here in the same commit as the trigger that sends it (T19 checks the
// migrations). Payloads carry ids, statuses, counters and timestamps only (Step 3 payload rule).
import type { JobKind, JobStatus } from '../jobs/kinds';

export interface ProjectChannelEvents {
  'dev.ping': { n: number };
  // EZD-009 Step 3: pushed by the job_broadcast trigger on each insert and status or progress change.
  'job.progress': {
    jobId: string;
    kind: JobKind;
    status: JobStatus;
    progress: number;
    attempts: number;
  };
  // EZD-125 (Q-0697 03; S06 Events emitted): pushed by the edit_lock_broadcast and edit_request_broadcast
  // triggers. Ids, statuses and timestamps only; the holder's name is read through GET /api/projects/[id]/lock.
  'lock.acquired': { holderAppUserId: string; lockEpoch: number; since: string };
  'lock.released': {
    formerHolderAppUserId: string;
    lockEpoch: number;
    reason: 'stop_editing' | 'closed' | 'request_accepted';
    at: string;
  };
  'lock.auto_released': { formerHolderAppUserId: string; lockEpoch: number; at: string };
  'lock.requested': {
    requestId: string;
    requesterAppUserId: string;
    requestedAt: string;
    deadlineAt: string;
  };
  'lock.request_declined': { requestId: string; requesterAppUserId: string; respondedAt: string };
  'lock.request_cancelled': { requestId: string; requesterAppUserId: string; respondedAt: string };
  // EZD-121 (S20 Events emitted): pushed by send_to_client after a send numbers its checkpoint.
  'version.sent': { modelVersionId: string; versionNo: number; sentAt: string };
  // EZD-122 (S20 Events emitted; Q-0700 03 "Revert"): pushed by name_snapshot and revert_to_version. A revert makes
  // every open editor reload; a new snapshot name refreshes the Versions panel.
  'version.snapshot_named': { modelVersionId: string };
  'version.reverted': { modelVersionId: string; fromVersionId: string };
}

export interface UserChannelEvents {
  'dev.ping': { n: number };
  'session.ended': Record<string, never>;
  // EZD-102 Step 2: pushed by the user_permission_broadcast triggers after any change to the member's
  // switches; the payload is empty and the browser refetches GET /api/permissions.
  'user_permission.updated': Record<string, never>;
  // EZD-110a Step 6: pushed by the notification_broadcast_created trigger after each insert, and by
  // open_notification (the opened id) and mark_all_notifications_read (null); the bell refetches its list.
  'notification.created': { notificationId: string };
  'notification.read': { notificationId: string | null };
  // EZD-711: pushed by the appraiser_read_broadcast trigger for the member's own property appraiser reads (the
  // wizard's read has no project, so it has no project channel); same payload as the project channel's.
  'job.progress': {
    jobId: string;
    kind: JobKind;
    status: JobStatus;
    progress: number;
    attempts: number;
  };
}

// realtime.send adds the message id as payload key `id` when the payload has none, and the same id
// arrives as meta.id; that key is dropped so subscribers get exactly the payload the database passed.
export function toEventPayload(message: { payload?: unknown; meta?: { id?: unknown } }): unknown {
  const { payload, meta } = message;
  if (
    payload !== null &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    meta?.id !== undefined &&
    (payload as Record<string, unknown>).id === meta.id
  ) {
    const copy: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
    delete copy.id;
    return copy;
  }
  return payload;
}

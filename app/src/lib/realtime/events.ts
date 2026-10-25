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
}

export interface UserChannelEvents {
  'dev.ping': { n: number };
  'session.ended': Record<string, never>;
  // EZD-102 Step 2: pushed by the user_permission_broadcast triggers after any change to the member's
  // switches; the payload is empty and the browser refetches GET /api/permissions.
  'user_permission.updated': Record<string, never>;
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

// EZD-018 Step 5 (vault/plans/EZD-018.md): typed event maps for the project and user channels. A later
// ticket adds its event name here in the same commit as the trigger that sends it (T19 checks the
// migrations). Payloads carry ids, statuses, counters and timestamps only (Step 3 payload rule).
export interface ProjectChannelEvents {
  'dev.ping': { n: number };
}

export interface UserChannelEvents {
  'dev.ping': { n: number };
  'session.ended': Record<string, never>;
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

// EZD-309 (phase-03 EZD-309 "each review action is saved as a per-item change, batched every 2 seconds"; Q-0215
// "saved until Finish or Cancel, even if the browser closes"): the review's save queue. Each action marks the
// item ids it changed (and the mode when it changed); 2 seconds after the first unsent mark the batch goes out
// as one PATCH, one request at a time, each item's current state (latest wins). A failed send keeps its items
// marked and tries again 2 seconds later; a refusal (403, 404, 409, 400) stops and reports it. When the page
// hides, what is marked is sent at once with keepalive.
import type { ReviewMode } from '../../lib/imports/review';
import type { ReviewChange } from '../../lib/imports/review-fix';

export const SAVE_EVERY_MS = 2000;

export type SaveBody = { mode: ReviewMode | null; changes: ReviewChange[] };
export type SendResult = 'saved' | 'retry' | { refused: number };

export type ReviewSaver = {
  mark(ids: readonly string[], mode?: ReviewMode): void;
  /** Send what is marked now (page hide); keepalive so it outlives the page. */
  flushNow(): void;
  /** Ids and mode still waiting to be sent (for tests). */
  pending(): { ids: string[]; mode: ReviewMode | null };
  dispose(): void;
};

export function createReviewSaver({
  build,
  send,
  onRefused,
  onRetry,
  onSaved,
  everyMs = SAVE_EVERY_MS,
}: {
  /** The body for these ids and mode, from the review's current state. */
  build: (ids: readonly string[], mode: ReviewMode | null) => SaveBody;
  send: (body: SaveBody, keepalive: boolean) => Promise<SendResult>;
  onRefused?: (status: number) => void;
  onRetry?: () => void;
  onSaved?: () => void;
  everyMs?: number;
}): ReviewSaver {
  let ids = new Set<string>();
  let mode: ReviewMode | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let stopped = false;

  const schedule = () => {
    if (timer || stopped) return;
    timer = setTimeout(() => {
      timer = null;
      void run(false);
    }, everyMs);
  };

  const take = (): SaveBody | null => {
    if (ids.size === 0 && mode === null) return null;
    const body = build([...ids], mode);
    ids = new Set();
    mode = null;
    return body;
  };

  const putBack = (body: SaveBody) => {
    for (const c of body.changes) ids.add(c.item_id);
    if (mode === null && body.mode !== null) mode = body.mode;
  };

  async function run(keepalive: boolean): Promise<void> {
    if (stopped) return;
    if (inFlight) {
      if (!keepalive) schedule();
      return;
    }
    const body = take();
    if (!body) return;
    inFlight = true;
    let result: SendResult;
    try {
      result = await send(body, keepalive);
    } catch {
      result = 'retry';
    }
    inFlight = false;
    if (result === 'saved') {
      onSaved?.();
      if (ids.size > 0 || mode !== null) schedule();
      return;
    }
    if (result === 'retry') {
      putBack(body);
      onRetry?.();
      schedule();
      return;
    }
    stopped = true;
    onRefused?.(result.refused);
  }

  return {
    mark(changed, nextMode) {
      if (stopped) return;
      for (const id of changed) ids.add(id);
      if (nextMode) mode = nextMode;
      if (ids.size > 0 || mode !== null) schedule();
    },
    flushNow() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      void run(true);
    },
    pending: () => ({ ids: [...ids], mode }),
    dispose() {
      if (timer) clearTimeout(timer);
      timer = null;
      stopped = true;
    },
  };
}

/** The PATCH the saver sends (route api/projects/[id]/imports/[jobId]). */
export function patchSender(projectId: string, jobId: string, fetchImpl: typeof fetch = fetch) {
  return async (body: SaveBody, keepalive: boolean): Promise<SendResult> => {
    const res = await fetchImpl(`/api/projects/${projectId}/imports/${jobId}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive,
    });
    await res.text().catch(() => '');
    if (res.ok) return 'saved';
    if (res.status === 400 || res.status === 403 || res.status === 404 || res.status === 409) {
      return { refused: res.status };
    }
    return 'retry';
  };
}

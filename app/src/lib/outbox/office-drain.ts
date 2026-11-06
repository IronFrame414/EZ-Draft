// EZD-120d Build step 6 (vault/plans/EZD-120d.md section 3 office-drain row; Decided "Office drain",
// "sendBeforeSignOut"; Q-0503; Q-0507): sends one person's queued edits from any office page, and before a
// sign-out. Loaded with import() only when something is queued. Never deletes edits.
import type { Actor, OutboxStorage } from './outbox';
import { createIdbOutboxStorage } from './outbox-idb';
import { createOutboxSync, type OutboxSync } from './outbox-sync';

export type DrainHandle = { sync: OutboxSync; storage: OutboxStorage; dispose(): void };

// Build choice (Q-0507): how long a sign-out waits for the send before it asks.
const DEFAULT_WAIT_MS = 10000;

export function startDrain(actor: Actor): DrainHandle {
  const storage = createIdbOutboxStorage(actor);
  const sync = createOutboxSync({ actor, storage });
  void sync.flush().catch(() => {});
  return {
    sync,
    storage,
    dispose() {
      sync.dispose();
      storage.close();
    },
  };
}

export async function sendBeforeSignOut(
  actor: Actor,
  handle: DrainHandle | null,
  waitMs: number = DEFAULT_WAIT_MS,
): Promise<'sent' | 'kept'> {
  const h = handle ?? startDrain(actor);
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, waitMs);
    });
    await Promise.race([h.sync.flush(), timeout]);
    return (await h.storage.list()).length === 0 ? 'sent' : 'kept';
  } catch {
    return 'kept';
  } finally {
    if (timer !== null) clearTimeout(timer);
    if (handle === null) h.dispose();
  }
}

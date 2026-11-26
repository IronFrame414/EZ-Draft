// EZD-120d Build step 6 (vault/plans/EZD-120d.md section 3 office-drain row; Decided "Office drain",
// "sendBeforeSignOut"; Q-0503; Q-0507): sends one person's queued edits from any office page, and before a
// sign-out. Loaded with import() only when something is queued. Never deletes edits.
// EZD-1402: and the queued field actions, through one field sender per page.
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

// EZD-1998: the field sender lives in field-drain.ts (re-exported here), so a field page loads it without the office
// autosave.
import { startFieldDrain, type FieldDrainHandle } from './field-drain';
export { startFieldDrain, type FieldDrainHandle };

// EZD-1402 (Q-0503): `field` also sends the queued field actions (null starts a sender for the call; left out,
// only the edits are sent); `sent` needs both emptied.
export async function sendBeforeSignOut(
  actor: Actor,
  handle: DrainHandle | null,
  waitMs: number = DEFAULT_WAIT_MS,
  field?: FieldDrainHandle | null,
): Promise<'sent' | 'kept'> {
  const h = handle ?? startDrain(actor);
  const f = field === undefined ? null : (field ?? startFieldDrain(actor));
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, waitMs);
    });
    await Promise.race([Promise.all([h.sync.flush(), f?.sync.drain()]), timeout]);
    if ((await h.storage.list()).length > 0) return 'kept';
    return f === null || (await f.queue.list()).length === 0 ? 'sent' : 'kept';
  } catch {
    return 'kept';
  } finally {
    if (timer !== null) clearTimeout(timer);
    if (handle === null) h.dispose();
    if (field === null) f?.dispose();
  }
}

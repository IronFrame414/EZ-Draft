// EZD-1998 (AC-EZD-1998-2; audit F7): the page's field sender, moved unchanged from office-drain.ts (which re-exports
// it) so OutboxDrain starts it on a field page without loading the office autosave (outbox-sync.ts).
// EZD-1402: sends what is queued now and every field action added through `sync.add`.
import { createFieldQueue, type FieldQueue } from './field-queue';
import { createFieldSync, type FieldSync } from './field-sync';
import type { Actor } from './outbox';

export type FieldDrainHandle = { sync: FieldSync; queue: FieldQueue; dispose(): void };

export function startFieldDrain(actor: Actor): FieldDrainHandle {
  const queue = createFieldQueue(actor);
  const sync = createFieldSync({ actor, queue });
  void sync.drain();
  return {
    sync,
    queue,
    dispose() {
      sync.dispose();
      queue.close();
    },
  };
}

// EZD-125 (Q-0681 (a); Q-0697 decisions 04 "Leaving the editor", "Tab close"; S06 Decision 12; 03b rules 7, 9;
// AC-EZD-125-8): letting go of the edit lock from the browser. No React.
//
// Stop editing: drain the outbox, make a checkpoint with the plan's thumbnail (EZD-224's makeCheckpoint), then
// release with reason stop_editing, and wait for it. A step that fails keeps the lock and answers its error, so
// the caller can show Retry: edits still queued after the drain, a checkpoint that was not made (a checkpoint
// made with a failed thumbnail still counts), or a refused release.
//
// The tab-close decision is in tab-close.ts (the editor's first download); this file loads with Stop editing.
import type { CheckpointOutcome } from '../thumbnail/checkpoint';
import { releaseLock, type ReleaseOutcome } from '../../lib/lock/lock-client';
import type { OutboxSync } from '../../lib/outbox/outbox-sync';
import type { ThumbnailCapture } from '../../lib/thumbnail/thumbnail';

export type StopEditingStep = 'drain' | 'checkpoint' | 'release';

export type StopEditingOutcome =
  { ok: true; lockEpoch: number } | { ok: false; step: StopEditingStep; code: string };

export type StopEditingDeps = {
  drain: () => Promise<void>;
  // The device's queued entries for this project after the drain.
  queued: () => Promise<number>;
  checkpoint: () => Promise<CheckpointOutcome>;
  release: () => Promise<ReleaseOutcome>;
};

// A checkpoint outcome without a versionId is a checkpoint that was not made.
export const checkpointMade = (o: CheckpointOutcome): boolean => 'versionId' in o;

export async function stopEditing(deps: StopEditingDeps): Promise<StopEditingOutcome> {
  try {
    await deps.drain();
  } catch {
    return { ok: false, step: 'drain', code: 'drain_failed' };
  }
  let left: number;
  try {
    left = await deps.queued();
  } catch {
    return { ok: false, step: 'drain', code: 'storage_failed' };
  }
  if (left > 0) return { ok: false, step: 'drain', code: 'unsaved_changes' };

  const made = await deps.checkpoint();
  if (!checkpointMade(made)) {
    return { ok: false, step: 'checkpoint', code: made.status === 'failed' ? made.code : 'failed' };
  }

  const released = await deps.release();
  if (!released.ok) return { ok: false, step: 'release', code: released.code };
  return { ok: true, lockEpoch: released.lockEpoch };
}

// Stop editing for an open editor session (editor-session.ts loads this file on the first Stop editing).
export function stopEditingSession(o: {
  projectId: string;
  sync: OutboxSync;
  // The device's queued entries for this project.
  queued: () => Promise<number>;
  fetchImpl: typeof fetch;
  capture: () => Promise<ThumbnailCapture | null>;
}): Promise<StopEditingOutcome> {
  return stopEditing({
    drain: () => o.sync.flush(),
    queued: o.queued,
    checkpoint: async () => {
      const { makeCheckpoint } = await import('../thumbnail/checkpoint');
      return makeCheckpoint(
        { projectId: o.projectId, capture: o.capture },
        { fetchImpl: o.fetchImpl },
      );
    },
    release: () => releaseLock(o.projectId, { reason: 'stop_editing' }, { fetchImpl: o.fetchImpl }),
  });
}

// EZD-5605 (vault/plans/EZD-5605.md D-SendNow; Q-0638 gap 10; AC-EZD-5605-5, -7): the part of OutboxSync.sendNow that
// runs inside the tab lock, loaded on first use (11 Budgets: the editor route stays under 500 KB). After the drain,
// with the outbox empty, the change is written to the device, sent alone marked `assistant: true` and committed on
// `saved`; on anything else it is dropped from the device again, with no conflict listed.
import type { Change } from '../../editor/model/patches';
import { MAX_CHANGES_PER_SAVE, type OutboxEntry } from './outbox';
import {
  UNSAVED,
  type SendNowContext,
  type SendNowOptions,
  type SendNowOutcome,
} from './outbox-sync';

// EZD-5605 D-SendNow: inside the tab lock, after the drain. The change is written to the device, sent alone and
// committed on `saved`; on anything else it is dropped from the device again.
export async function sendNowLocked(
  ctx: SendNowContext,
  projectId: string,
  lockEpoch: number,
  changes: Change[],
  opts: SendNowOptions,
): Promise<SendNowOutcome> {
  const { storage, storageFailed } = ctx;
  const set = ctx.store.setState;
  await ctx.drainNow();
  if (ctx.stopped()) return UNSAVED;
  const resting = ctx.store.getState().status;
  let mine: OutboxEntry[];
  try {
    // Anything left in the outbox (of any project) means the drain stopped; nothing is sent ahead of it.
    if ((await storage.list()).length > 0) return UNSAVED;
    await storage.put(projectId, lockEpoch, changes, Date.now());
    const ids = new Set(changes.map((c) => c.id));
    mine = (await storage.list()).filter((e) => e.projectId === projectId && ids.has(e.id));
  } catch (error) {
    await storageFailed(error);
    return UNSAVED;
  }
  const drop = async (): Promise<boolean> => {
    try {
      await storage.drop(mine);
      return true;
    } catch (error) {
      await storageFailed(error);
      return false;
    }
  };
  if (!opts.stillValid()) {
    await drop();
    return { kind: 'cancelled' };
  }
  // P120a parseSaveRequest: a delete of an object the server never saved is dropped, not sent.
  const sendList = mine.filter((e) => !(e.value === null && e.baseSeq === 0));
  const unsent = mine.filter((e) => e.value === null && e.baseSeq === 0);
  if (unsent.length > 0) {
    try {
      await storage.drop(unsent);
    } catch (error) {
      await storageFailed(error);
      await drop();
      return UNSAVED;
    }
  }
  if (sendList.length === 0) return { kind: 'saved', objects: [] };
  set({ status: 'saving' });
  const outcome = await ctx.send({ projectId, lockEpoch, send: sendList, drop: [] }, [], {
    assistant: true,
  });
  if (outcome.kind !== 'saved') {
    mine = sendList;
    const dropped = await drop();
    if (dropped) set({ status: resting });
    return outcome;
  }
  ctx.onSaved?.(projectId, outcome.objects);
  try {
    await storage.commit(projectId, sendList, outcome.objects);
  } catch (error) {
    ctx.unstored.unshift({ projectId, sent: sendList, saved: outcome.objects });
    set({ failures: 0, lastSavedAt: Date.now() });
    await storageFailed(error);
    return outcome;
  }
  set({ failures: 0, status: 'saved', lastSavedAt: Date.now() });
  return outcome;
}

// D-SendNow (1)-(3), (9): nothing is sent for 0 or over 100 changes, while blocked or offline, or without the lock.
export async function sendNow(
  ctx: SendNowContext,
  projectId: string,
  lockEpoch: number,
  changes: Change[],
  opts: SendNowOptions,
): Promise<SendNowOutcome> {
  if (changes.length === 0 || changes.length > MAX_CHANGES_PER_SAVE) return UNSAVED;
  await ctx.settle();
  if (ctx.stopped()) return UNSAVED;
  const r = await ctx.exclusive(() => sendNowLocked(ctx, projectId, lockEpoch, changes, opts));
  return r.ran ? r.value : UNSAVED;
}

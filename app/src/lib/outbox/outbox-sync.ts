// EZD-120b Build step 6 (vault/plans/EZD-120b.md section 3 outbox-sync row; Decided "Drain", "States",
// "Refused", "Failed", "webTabLock", "Storage failure", "Request", "Saved match"; 00d; S03 States; Q-0501;
// Q-0507 gaps 4, 5): autosave. Each change is written to the device outbox first; 2,000 ms after the last one
// the outbox is sent to the objects route one request at a time, under one lock per user and company across
// the browser's tabs.
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Change } from '../../editor/model/patches';
import { createOnlineSource, type OnlineSource } from '../network';
import {
  classifySave,
  MEMBERSHIP_HEADER,
  pickBatch,
  type Actor,
  type Batch,
  type OutboxEntry,
  type OutboxStorage,
  type RefusedCode,
  type SaveOutcome,
} from './outbox';

export type TabLock = {
  tryRun<T>(name: string, fn: () => Promise<T>): Promise<{ ran: true; value: T } | { ran: false }>;
};

export type SyncState = {
  status: 'idle' | 'pending' | 'saving' | 'saved' | 'offline' | 'error';
  failures: number;
  problem: RefusedCode | 'storage_failed' | null;
  lastSavedAt: number | null;
};

export type OutboxSync = StoreApi<SyncState> & {
  enqueue(projectId: string, lockEpoch: number, changes: Change[]): Promise<void>;
  flush(): Promise<void>;
  retry(): void;
  dispose(): void;
};

// Decided "Failed": the waits before each retry in a row; the last repeats.
const RETRY_DELAYS_MS = [2000, 4000, 8000, 16000, 30000];
// Decided "Drain": a lock held by another tab is tried again after this wait.
const LOCK_BUSY_RETRY_MS = 2000;
const DEFAULT_DEBOUNCE_MS = 2000;

// Decided "webTabLock": the Web Locks API with ifAvailable; without it (an old browser) the drain just runs.
export function webTabLock(): TabLock {
  return {
    async tryRun<T>(name: string, fn: () => Promise<T>) {
      const locks = (globalThis.navigator as { locks?: LockManager } | undefined)?.locks;
      if (!locks) return { ran: true as const, value: await fn() };
      return locks.request(name, { ifAvailable: true }, async (lock) =>
        lock === null ? { ran: false as const } : { ran: true as const, value: await fn() },
      );
    },
  };
}

// Decided "Request": exactly the keys parseSaveRequest accepts.
function toRequestChange(e: OutboxEntry) {
  return e.value === null
    ? { id: e.id, baseSeq: e.baseSeq, deleted: true }
    : {
        id: e.id,
        baseSeq: e.baseSeq,
        deleted: false,
        type: e.value.type,
        schemaVersion: e.value.schemaVersion,
        data: e.value.data,
      };
}

type PendingWrite =
  | { projectId: string; lockEpoch: number; changes: Change[]; now: number }
  | { projectId: string; sent: OutboxEntry[]; saved: { id: string; updatedSeq: number }[] };

async function reportStorage(error: unknown): Promise<void> {
  const { captureBrowserError } = await import('../errors/capture');
  captureBrowserError(error, 'outbox.storage');
}

export function createOutboxSync(o: {
  actor: Actor;
  storage: OutboxStorage;
  fetchImpl?: typeof fetch;
  lock?: TabLock;
  online?: OnlineSource;
  debounceMs?: number;
}): OutboxSync {
  const storage = o.storage;
  const fetchImpl = o.fetchImpl ?? fetch;
  const lock = o.lock ?? webTabLock();
  const online = o.online ?? createOnlineSource();
  const debounceMs = o.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const lockName = `ezdraft-outbox:${o.actor.appUserId}:${o.actor.tenantId}`;

  const store = createStore<SyncState>()(() => ({
    status: 'idle',
    failures: 0,
    problem: null,
    lastSavedAt: null,
  }));

  let timer: ReturnType<typeof setTimeout> | null = null;
  let writes: Promise<void> = Promise.resolve();
  let running: Promise<void> | null = null;
  let rerun = false;
  let disposed = false;
  // Decided "Storage failure" (Q-0596): writes the device storage refused, in order, run again by retry().
  const unstored: PendingWrite[] = [];

  const set = (patch: Partial<SyncState>) => store.setState(patch);
  const isOnline = () => online.getSnapshot();
  // Not saving: an unstored write (outranks offline), offline, an error (a refusal, a storage failure or the
  // 3rd failure in a row) or waiting.
  const restingStatus = (): SyncState['status'] => {
    const s = store.getState();
    if (unstored.length > 0) return 'error';
    if (!isOnline()) return 'offline';
    if (s.problem !== null || s.failures >= 3) return 'error';
    return 'pending';
  };

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const schedule = (ms: number) => {
    clearTimer();
    if (disposed) return;
    timer = setTimeout(() => {
      timer = null;
      void drain();
    }, ms);
  };

  const storageFailed = async (error: unknown) => {
    set({ status: 'error', problem: 'storage_failed' });
    await reportStorage(error);
  };

  const send = async (batch: Batch): Promise<SaveOutcome> => {
    try {
      const res = await fetchImpl(`/api/projects/${encodeURIComponent(batch.projectId)}/objects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [MEMBERSHIP_HEADER]: o.actor.membershipId },
        body: JSON.stringify({
          lockEpoch: batch.lockEpoch,
          changes: batch.send.map(toRequestChange),
        }),
      });
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      return classifySave(res.status, body);
    } catch {
      return { kind: 'failed' };
    }
  };

  // One fetch at a time until the outbox is empty, a save is refused or fails, or the debounce timer is pending.
  const loop = async (): Promise<void> => {
    for (let first = true; ; first = false) {
      if (disposed) return;
      if (unstored.length > 0) {
        set({ status: 'error', problem: 'storage_failed' });
        return;
      }
      if (!first && timer !== null) {
        set({ status: restingStatus() });
        return;
      }
      if (!isOnline()) {
        set({ status: 'offline' });
        return;
      }
      rerun = false;
      let batch: Batch | null;
      try {
        batch = pickBatch(await storage.list());
        if (batch !== null && batch.drop.length > 0) await storage.drop(batch.drop);
      } catch (error) {
        await storageFailed(error);
        return;
      }
      // A put that failed while the list was read: the unstored write goes first, nothing is sent.
      if (unstored.length > 0) {
        set({ status: 'error', problem: 'storage_failed' });
        return;
      }
      if (batch === null) {
        set({ status: 'saved', lastSavedAt: Date.now() });
        return;
      }
      if (batch.send.length === 0) continue;

      set({ status: 'saving' });
      const outcome = await send(batch);
      if (outcome.kind === 'refused') {
        // An unstored write keeps problem storage_failed: retry() must run it first.
        set({ status: 'error', problem: unstored.length > 0 ? 'storage_failed' : outcome.code });
        return;
      }
      if (outcome.kind === 'failed') {
        const failures = store.getState().failures + 1;
        set({ failures });
        set({ status: restingStatus() });
        schedule(RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length) - 1]);
        return;
      }
      try {
        await storage.commit(batch.projectId, batch.send, outcome.objects);
      } catch (error) {
        unstored.unshift({ projectId: batch.projectId, sent: batch.send, saved: outcome.objects });
        set({ failures: 0 });
        await storageFailed(error);
        return;
      }
      set({ failures: 0 });
    }
  };

  // Decided "Refused": a refusal (or a storage failure) stops the drains until retry().
  const blocked = () => unstored.length > 0 || store.getState().problem !== null;

  function drain(): Promise<void> {
    if (disposed || blocked()) return Promise.resolve();
    if (running !== null) {
      rerun = true;
      return running;
    }
    if (!isOnline()) {
      set({ status: 'offline' });
      return Promise.resolve();
    }
    const run = (async () => {
      try {
        const result = await lock.tryRun(lockName, loop);
        if (!result.ran) schedule(LOCK_BUSY_RETRY_MS);
      } finally {
        running = null;
      }
      if (rerun && !disposed) {
        rerun = false;
        await drain();
      }
    })();
    running = run;
    return run;
  }

  // Decided "Refused": retry() clears the problem and drains now, as flush().
  const resume = () => {
    if (disposed) return;
    set({ problem: null });
    set({ status: restingStatus() });
    clearTimer();
    void drain();
  };

  const unsubscribe = online.subscribe(() => {
    if (disposed) return;
    if (!isOnline()) {
      if (store.getState().status !== 'idle') set({ status: restingStatus() });
      return;
    }
    if (store.getState().status === 'offline') {
      set({ status: restingStatus() });
      clearTimer();
      void drain();
    }
  });

  return {
    ...store,
    enqueue(projectId, lockEpoch, changes) {
      const write = writes.then(async () => {
        const now = Date.now();
        // Behind an unstored write: kept in order after it, never written ahead of it.
        if (unstored.length > 0) {
          unstored.push({ projectId, lockEpoch, changes, now });
          set({ status: 'error', problem: 'storage_failed' });
          return;
        }
        try {
          await storage.put(projectId, lockEpoch, changes, now);
        } catch (error) {
          unstored.push({ projectId, lockEpoch, changes, now });
          await storageFailed(error);
          return;
        }
        if (disposed) return;
        if (store.getState().status !== 'saving') set({ status: restingStatus() });
        if (!blocked()) schedule(debounceMs);
      });
      writes = write;
      return write;
    },
    async flush() {
      await writes;
      clearTimer();
      if (running !== null) await running;
      await drain();
    },
    retry() {
      if (disposed) return;
      if (unstored.length === 0) {
        resume();
        return;
      }
      // Decided "Storage failure": the unstored writes first, in order, each removed once stored; a throw
      // stops the run with the rest kept and no fetch.
      writes = writes.then(async () => {
        while (unstored.length > 0) {
          if (disposed) return;
          const op = unstored[0];
          try {
            if ('sent' in op) await storage.commit(op.projectId, op.sent, op.saved);
            else await storage.put(op.projectId, op.lockEpoch, op.changes, op.now);
          } catch (error) {
            await storageFailed(error);
            return;
          }
          unstored.splice(unstored.indexOf(op), 1);
        }
        resume();
      });
    },
    dispose() {
      disposed = true;
      clearTimer();
      unsubscribe();
    },
  };
}

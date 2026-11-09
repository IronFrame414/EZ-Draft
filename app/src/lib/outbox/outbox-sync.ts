// EZD-120b Build step 6 (vault/plans/EZD-120b.md section 3 outbox-sync row; Decided "Drain", "States",
// "Refused", "Failed", "webTabLock", "Storage failure", "Request", "Saved match"; 00d; S03 States; Q-0501;
// Q-0507 gaps 4, 5): autosave. Each change is written to the device outbox first; 2,000 ms after the last one
// the outbox is sent to the objects route one request at a time, under one lock per user and company across
// the browser's tabs.
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Change } from '../../editor/model/patches';
import { APP_BUILD_HEADER, appBuild } from '../app-version';
import { postConflicts, removeServerConflict } from '../conflicts/conflict-api';
import {
  MAX_RECORD_CHANGES,
  MAX_RECORD_DATA_BYTES,
  type RecordedChange,
  type SyncConflictReason,
} from '../conflicts/conflicts';
import { createOnlineSource, type OnlineSource } from '../network';
import {
  classifySave,
  MEMBERSHIP_HEADER,
  pickBatch,
  type Actor,
  type Batch,
  type ConflictMove,
  type ConflictServerUpdate,
  type DeviceConflict,
  type DeviceConflictReason,
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
  // EZD-299b Build step 5: bumped whenever the device conflict list changes.
  conflictRev: number;
};

export type OutboxSync = StoreApi<SyncState> & {
  enqueue(projectId: string, lockEpoch: number, changes: Change[]): Promise<void>;
  flush(): Promise<void>;
  retry(): void;
  // EZD-299b Decided D-KeepMine (sync): the row's change goes back in the outbox at this base.
  keepMine(row: DeviceConflict, baseSeq: number): Promise<{ kept: boolean }>;
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

async function reportAt(error: unknown, location: string): Promise<void> {
  const { captureBrowserError } = await import('../errors/capture');
  captureBrowserError(error, location);
}

async function reportStorage(error: unknown): Promise<void> {
  await reportAt(error, 'outbox.storage');
}

// EZD-299b Decided D-Record: the change a conflict row records on the server.
function toRecordedChange(r: DeviceConflict): RecordedChange {
  const reason = r.reason as SyncConflictReason;
  return r.value === null
    ? { id: r.objectId, baseSeq: r.baseSeq, reason, deleted: true }
    : {
        id: r.objectId,
        baseSeq: r.baseSeq,
        reason,
        deleted: false,
        type: r.value.type,
        schemaVersion: r.value.schemaVersion,
        data: r.value.data,
      };
}

const dataBytes = (r: DeviceConflict): number =>
  r.value === null ? 0 : new TextEncoder().encode(JSON.stringify(r.value.data)).length;

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
    conflictRev: 0,
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

  const bumpConflicts = () => set({ conflictRev: store.getState().conflictRev + 1 });

  const send = async (batch: Batch, resolves: string[]): Promise<SaveOutcome> => {
    try {
      const res = await fetchImpl(`/api/projects/${encodeURIComponent(batch.projectId)}/objects`, {
        method: 'POST',
        // EZD-299a Build step 14 (Q-0626): every save names the app build it came from.
        headers: {
          'Content-Type': 'application/json',
          [MEMBERSHIP_HEADER]: o.actor.membershipId,
          [APP_BUILD_HEADER]: String(appBuild()),
        },
        // EZD-299b Decided D-Resolves: `resolves` only when a sent change settles a listed conflict.
        body: JSON.stringify(
          resolves.length > 0
            ? { lockEpoch: batch.lockEpoch, changes: batch.send.map(toRequestChange), resolves }
            : { lockEpoch: batch.lockEpoch, changes: batch.send.map(toRequestChange) },
        ),
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

  // EZD-299b Decided D-Settle: the changes a refusal for good moves to the conflict list; none blocks as before.
  const settle = async (
    batch: Batch,
    outcome: Extract<SaveOutcome, { kind: 'refused' }>,
  ): Promise<ConflictMove[]> => {
    if (outcome.code === 'save_conflict' && outcome.conflicts) {
      const listed = outcome.conflicts;
      const moves: ConflictMove[] = [];
      for (const entry of batch.send) {
        const hit = listed.find((c) => c.id === entry.id);
        if (hit) moves.push({ entry, reason: 'conflict', serverSeq: hit.serverSeq });
      }
      return moves;
    }
    if (outcome.code === 'invalid_object' && outcome.invalid) {
      const listed = outcome.invalid;
      return batch.send
        .filter((entry) => listed.some((c) => c.id === entry.id))
        .map((entry) => ({ entry, reason: 'invalid' as const, serverSeq: null }));
    }
    let reason: DeviceConflictReason;
    if (outcome.code === 'permission_denied') reason = 'not_editable';
    else if (outcome.code === 'project_not_found') reason = 'not_open';
    else return [];
    const ofProject = (await storage.list()).filter((e) => e.projectId === batch.projectId);
    const unsent = ofProject.filter((e) => e.value === null && e.baseSeq === 0);
    if (unsent.length > 0) await storage.drop(unsent);
    return ofProject
      .filter((e) => !(e.value === null && e.baseSeq === 0))
      .map((entry) => ({ entry, reason, serverSeq: null }));
  };

  // EZD-299b Decided D-Record: the listed rows not yet on the server, one record call per project and chunk.
  const recordPending = async (): Promise<void> => {
    if (disposed || !isOnline()) return;
    try {
      let rows: DeviceConflict[];
      try {
        rows = await storage.listConflicts();
      } catch (error) {
        await storageFailed(error);
        return;
      }
      const updates: ConflictServerUpdate[] = [];
      const groups = new Map<string, DeviceConflict[]>();
      for (const r of rows) {
        if (r.state !== 'listed' || r.server !== 'pending') continue;
        if (dataBytes(r) > MAX_RECORD_DATA_BYTES) {
          updates.push({
            projectId: r.projectId,
            objectId: r.objectId,
            refusedAt: r.refusedAt,
            server: 'device',
            serverId: null,
          });
          continue;
        }
        const group = groups.get(r.projectId);
        if (group) group.push(r);
        else groups.set(r.projectId, [r]);
      }
      send: for (const [projectId, group] of groups) {
        for (let i = 0; i < group.length; i += MAX_RECORD_CHANGES) {
          const chunk = group.slice(i, i + MAX_RECORD_CHANGES);
          const answer = await postConflicts(
            fetchImpl,
            o.actor.membershipId,
            projectId,
            chunk.map(toRecordedChange),
          );
          if (answer.kind === 'failed') break send;
          if (answer.kind === 'recorded') {
            chunk.forEach((r, n) =>
              updates.push({
                projectId: r.projectId,
                objectId: r.objectId,
                refusedAt: r.refusedAt,
                server: 'recorded',
                serverId: answer.ids[n],
              }),
            );
          } else if (answer.status === 404) {
            for (const r of chunk) {
              updates.push({
                projectId: r.projectId,
                objectId: r.objectId,
                refusedAt: r.refusedAt,
                server: 'device',
                serverId: null,
                reason: 'not_open',
              });
            }
          } else if (answer.status === 400) {
            for (const r of chunk) {
              updates.push({
                projectId: r.projectId,
                objectId: r.objectId,
                refusedAt: r.refusedAt,
                server: 'device',
                serverId: null,
              });
            }
            await reportAt(new Error('sync_conflict_record_refused'), 'outbox.record');
          }
        }
      }
      if (updates.length === 0) return;
      let orphans: Awaited<ReturnType<OutboxStorage['setConflictServer']>>;
      try {
        orphans = await storage.setConflictServer(updates);
      } catch (error) {
        await storageFailed(error);
        return;
      }
      for (const orphan of orphans) {
        if (orphan.serverId !== null) await removeServerConflict(fetchImpl, orphan.serverId);
      }
      bumpConflicts();
    } catch (error) {
      await reportAt(error, 'outbox.record');
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
      const resolves: string[] = [];
      try {
        batch = pickBatch(await storage.list());
        if (batch !== null && batch.drop.length > 0) await storage.drop(batch.drop);
        if (batch !== null && batch.send.length > 0) {
          const rows = await storage.listConflicts();
          for (const e of batch.send) {
            const row = rows.find(
              (r) => r.projectId === e.projectId && r.objectId === e.id && r.state === 'requeued',
            );
            if (row?.serverId) resolves.push(row.serverId);
          }
        }
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
      const outcome = await send(batch, resolves);
      if (outcome.kind === 'refused') {
        let moves: ConflictMove[];
        try {
          moves = await settle(batch, outcome);
        } catch (error) {
          await storageFailed(error);
          return;
        }
        if (moves.length === 0) {
          // An unstored write keeps problem storage_failed: retry() must run it first.
          set({ status: 'error', problem: unstored.length > 0 ? 'storage_failed' : outcome.code });
          return;
        }
        try {
          await storage.moveToConflicts(moves, Date.now());
        } catch (error) {
          await storageFailed(error);
          return;
        }
        if (outcome.code === 'invalid_object') {
          await reportAt(new Error('invalid_object'), 'outbox.invalid_object');
        }
        set({ failures: 0, conflictRev: store.getState().conflictRev + 1 });
        continue;
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
        const result = await lock.tryRun(lockName, async () => {
          try {
            await loop();
          } finally {
            await recordPending();
          }
        });
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
    keepMine(row, baseSeq) {
      const p = writes.then(async () => {
        let result: { kept: boolean };
        try {
          result = await storage.requeue(row, baseSeq, Date.now());
        } catch (error) {
          await storageFailed(error);
          throw error;
        }
        // Q-0648 (b): a newer refusal at the key kept the row; nothing changed, nothing to send.
        if (result.kept) return { kept: true };
        bumpConflicts();
        clearTimer();
        void drain();
        return { kept: false };
      });
      writes = p.then(
        () => {},
        () => {},
      );
      return p;
    },
    dispose() {
      disposed = true;
      clearTimer();
      unsubscribe();
    },
  };
}

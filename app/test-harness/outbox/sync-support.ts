// EZD-120b test support (vault/plans/EZD-120b.md sections 3-4): an in-memory OutboxStorage that follows the
// plan's Decided "put" and "commit, drop" rows, a mutex TabLock, a controllable online source and a fetch stub
// that answers like the objects route (200 `{ objects: [{ id, updatedSeq }] }`). Test-only; no live service.
import type { LoadedObject, ObjectValue } from '../../src/lib/outbox/model-api';
import type {
  ConflictKey,
  ConflictOrphan,
  DeviceConflict,
  OutboxEntry,
  OutboxStorage,
} from '../../src/lib/outbox/outbox';
import type { TabLock } from '../../src/lib/outbox/outbox-sync';

// `Change` as the plan's section 1 defines it (null value = deleted).
export type Change = { id: string; value: ObjectValue | null };

export function createMemoryStorage(): OutboxStorage & {
  entries: Map<string, OutboxEntry>;
  conflicts: Map<string, DeviceConflict>;
} {
  const entries = new Map<string, OutboxEntry>();
  const conflicts = new Map<string, DeviceConflict>();
  const mirror = new Map<string, number>();
  const key = (p: string, id: string) => `${p}|${id}`;
  return {
    entries,
    conflicts,
    async put(projectId, lockEpoch, changes, now) {
      for (const c of changes) {
        const k = key(projectId, c.id);
        const old = entries.get(k);
        entries.set(
          k,
          old
            ? { ...old, value: c.value, rev: old.rev + 1 }
            : {
                projectId,
                id: c.id,
                baseSeq: mirror.get(k) ?? 0,
                lockEpoch,
                value: c.value,
                rev: 1,
                queuedAt: now,
              },
        );
      }
    },
    async list() {
      return [...entries.values()].sort(
        (a, b) =>
          a.queuedAt - b.queuedAt ||
          a.projectId.localeCompare(b.projectId) ||
          a.id.localeCompare(b.id),
      );
    },
    async commit(projectId, sent, saved) {
      for (const s of sent) {
        const k = key(projectId, s.id);
        const hit = saved.find((o) => o.id === s.id);
        if (!hit) continue;
        const now = entries.get(k);
        if (s.value === null) mirror.delete(k);
        else mirror.set(k, hit.updatedSeq);
        if (now && now.rev === s.rev) entries.delete(k);
        else if (now) entries.set(k, { ...now, baseSeq: hit.updatedSeq });
        // EZD-299b D-Resolves: a requeued row at a saved key goes in the same commit (no rev check).
        if (conflicts.get(k)?.state === 'requeued') conflicts.delete(k);
      }
    },
    async drop(list) {
      for (const e of list) {
        const k = key(e.projectId, e.id);
        if (entries.get(k)?.rev === e.rev) entries.delete(k);
      }
    },
    async replaceMirror(projectId: string, objects: LoadedObject[]) {
      for (const k of [...mirror.keys()]) if (k.startsWith(`${projectId}|`)) mirror.delete(k);
      for (const o of objects) mirror.set(key(projectId, o.id), o.updatedSeq);
    },
    // EZD-299b section 3 / D-Move, D-Server, D-Requeue: the six conflict methods, as the plan words them.
    async moveToConflicts(moves, now) {
      for (const m of moves) {
        const k = key(m.entry.projectId, m.entry.id);
        const cur = entries.get(k);
        if (!cur || cur.rev !== m.entry.rev) continue;
        entries.delete(k);
        conflicts.set(k, {
          projectId: cur.projectId,
          objectId: cur.id,
          reason: m.reason,
          baseSeq: cur.baseSeq,
          serverSeq: m.serverSeq,
          lockEpoch: cur.lockEpoch,
          value: cur.value,
          refusedAt: now,
          state: 'listed',
          server: m.reason === 'not_open' ? 'device' : 'pending',
          serverId: conflicts.get(k)?.serverId ?? null,
        });
      }
    },
    async listConflicts() {
      return [...conflicts.values()].sort(
        (a, b) =>
          a.refusedAt - b.refusedAt ||
          a.projectId.localeCompare(b.projectId) ||
          a.objectId.localeCompare(b.objectId),
      );
    },
    async setConflictServer(updates) {
      const orphans: ConflictOrphan[] = [];
      for (const u of updates) {
        const k = key(u.projectId, u.objectId);
        const row = conflicts.get(k);
        if (!row) {
          orphans.push({ projectId: u.projectId, objectId: u.objectId, serverId: u.serverId });
        } else if (row.refusedAt === u.refusedAt) {
          conflicts.set(k, {
            ...row,
            server: u.server,
            serverId: u.serverId ?? row.serverId,
            reason: u.reason ?? row.reason,
          });
        } else {
          conflicts.set(k, { ...row, serverId: u.serverId ?? row.serverId });
        }
      }
      return orphans;
    },
    // D-Guard: a number deletes only a stored row with that refusedAt; null deletes nothing; absent deletes
    // what is stored. Returns the keys of stored rows kept for not matching.
    async deleteConflicts(keys) {
      const kept: ConflictKey[] = [];
      for (const c of keys) {
        const k = key(c.projectId, c.objectId);
        const stored = conflicts.get(k);
        if (!stored) continue;
        if (c.refusedAt === undefined || c.refusedAt === stored.refusedAt) conflicts.delete(k);
        else kept.push({ projectId: c.projectId, objectId: c.objectId });
      }
      return kept;
    },
    // D-Requeue: a stored row with another refusedAt (a newer refusal) is left alone.
    async requeue(row, baseSeq, now) {
      const k = key(row.projectId, row.objectId);
      const stored = conflicts.get(k);
      if (stored && stored.refusedAt !== row.refusedAt) return { kept: true };
      conflicts.set(k, { ...row, state: 'requeued' });
      const cur = entries.get(k);
      entries.set(
        k,
        cur
          ? { ...cur, baseSeq, rev: cur.rev + 1 }
          : {
              projectId: row.projectId,
              id: row.objectId,
              baseSeq,
              lockEpoch: row.lockEpoch,
              value: row.value,
              rev: 1,
              queuedAt: now,
            },
      );
      return { kept: false };
    },
    async setMirror(projectId, objectId, value, updatedSeq) {
      const k = key(projectId, objectId);
      if (value === null) mirror.delete(k);
      else mirror.set(k, updatedSeq);
    },
    close() {},
  };
}

// One mutex shared by every sync built over it: a busy lock answers `{ ran: false }`.
export function createMutexLock(): TabLock {
  let busy = false;
  return {
    async tryRun<T>(_name: string, fn: () => Promise<T>) {
      if (busy) return { ran: false as const };
      busy = true;
      try {
        return { ran: true as const, value: await fn() };
      } finally {
        busy = false;
      }
    },
  };
}

export const alwaysLock: TabLock = {
  async tryRun<T>(_name: string, fn: () => Promise<T>) {
    return { ran: true as const, value: await fn() };
  },
};

export function createOnline(initial: boolean) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    source: {
      subscribe: (cb: () => void) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      getSnapshot: () => value,
    },
    set(next: boolean) {
      value = next;
      for (const cb of [...listeners]) cb();
    },
  };
}

export type SentCall = {
  url: string;
  method: string;
  body: { lockEpoch: number; changes: Change[]; resolves?: string[] };
};

export async function readCall(input: unknown, init?: RequestInit): Promise<SentCall> {
  if (input instanceof Request) {
    return { url: input.url, method: input.method, body: JSON.parse(await input.text()) };
  }
  return {
    url: String(input),
    method: init?.method ?? 'GET',
    body: JSON.parse(String(init?.body ?? 'null')),
  };
}

export const savedResponse = (call: SentCall, updatedSeq = 1) =>
  Response.json({
    objects: (call.body.changes as unknown as { id: string }[]).map((c) => ({
      id: c.id,
      updatedSeq,
    })),
  });

export const v = (n: number) => ({
  type: 'floor',
  schemaVersion: 1,
  data: { name: `F${n}`, order: n },
});

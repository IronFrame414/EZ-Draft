// EZD-120b test support (vault/plans/EZD-120b.md sections 3-4): an in-memory OutboxStorage that follows the
// plan's Decided "put" and "commit, drop" rows, a mutex TabLock, a controllable online source and a fetch stub
// that answers like the objects route (200 `{ objects: [{ id, updatedSeq }] }`). Test-only; no live service.
import type { LoadedObject, ObjectValue } from '../../src/lib/outbox/model-api';
import type { OutboxEntry, OutboxStorage } from '../../src/lib/outbox/outbox';
import type { TabLock } from '../../src/lib/outbox/outbox-sync';

// `Change` as the plan's section 1 defines it (null value = deleted).
export type Change = { id: string; value: ObjectValue | null };

export function createMemoryStorage(): OutboxStorage & { entries: Map<string, OutboxEntry> } {
  const entries = new Map<string, OutboxEntry>();
  const mirror = new Map<string, number>();
  const key = (p: string, id: string) => `${p}|${id}`;
  return {
    entries,
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

export type SentCall = { url: string; method: string; body: { lockEpoch: number; changes: Change[] } };

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

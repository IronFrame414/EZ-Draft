// EZD-120b Build step 5 (vault/plans/EZD-120b.md section 3 storage row; Decided "Device database", "put",
// "commit, drop"; Q-0503; 03a; 03b rules 6, 9): the device outbox and the saved-object mirror in IndexedDB. Keys
// start with the app user and the company, and a storage reads only its own range, so one person's or one
// company's edits are never seen under another. One connection, opened on first use. Errors are thrown to the
// caller (outbox-sync.ts reports them).
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Change } from '../../editor/model/patches';
import type { LoadedObject, ObjectValue } from './model-api';
import type {
  Actor,
  ConflictKey,
  ConflictOrphan,
  DeviceConflict,
  OutboxEntry,
  OutboxStorage,
} from './outbox';
import {
  actorRange,
  CONFLICT_KEY_PART,
  conflictRange,
  DEVICE_DB,
  DEVICE_DB_VERSION,
  OUTBOX_STORE,
} from './device-db';

const OUTBOX = OUTBOX_STORE;
const WORKING_COPY = 'working_copy';

type DeviceKey = [string, string, string, string];
// EZD-299b Decided D-Key: a conflict row's key, outside the actor's range of the same store.
type ConflictDeviceKey = [string, string, string, string, string];
type MirrorRecord = { value: ObjectValue; updatedSeq: number };

interface DeviceDb extends DBSchema {
  outbox: { key: DeviceKey | ConflictDeviceKey; value: OutboxEntry | DeviceConflict };
  working_copy: { key: DeviceKey; value: MirrorRecord };
}

const byQueue = (a: OutboxEntry, b: OutboxEntry) =>
  a.queuedAt - b.queuedAt ||
  (a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0) ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// EZD-299b section 3: conflict rows by refusedAt, then project id, then object id.
const byRefusal = (a: DeviceConflict, b: DeviceConflict) =>
  a.refusedAt - b.refusedAt ||
  (a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0) ||
  (a.objectId < b.objectId ? -1 : a.objectId > b.objectId ? 1 : 0);

export function createIdbOutboxStorage(actor: Actor): OutboxStorage {
  const u = actor.appUserId;
  const t = actor.tenantId;
  const key = (projectId: string, id: string): DeviceKey => [u, t, projectId, id];
  const conflictKey = (projectId: string, objectId: string): ConflictDeviceKey => [
    CONFLICT_KEY_PART,
    u,
    t,
    projectId,
    objectId,
  ];
  const range = () => actorRange(u, t);
  let connection: Promise<IDBPDatabase<DeviceDb>> | null = null;

  const db = (): Promise<IDBPDatabase<DeviceDb>> => {
    if (connection === null) {
      const opening = openDB<DeviceDb>(DEVICE_DB, DEVICE_DB_VERSION, {
        upgrade(d) {
          d.createObjectStore(OUTBOX);
          d.createObjectStore(WORKING_COPY);
        },
        blocking() {
          void opening.then((d) => d.close());
          if (connection === opening) connection = null;
        },
      });
      connection = opening;
      opening.catch(() => {
        if (connection === opening) connection = null;
      });
    }
    return connection;
  };

  return {
    async put(projectId, lockEpoch, changes: Change[], now) {
      const tx = (await db()).transaction([OUTBOX, WORKING_COPY], 'readwrite');
      const outbox = tx.objectStore(OUTBOX);
      const mirror = tx.objectStore(WORKING_COPY);
      for (const c of changes) {
        const k = key(projectId, c.id);
        const old = (await outbox.get(k)) as OutboxEntry | undefined;
        if (old) {
          await outbox.put({ ...old, value: c.value, rev: old.rev + 1 }, k);
        } else {
          const saved = await mirror.get(k);
          await outbox.put(
            {
              projectId,
              id: c.id,
              baseSeq: saved?.updatedSeq ?? 0,
              lockEpoch,
              value: c.value,
              rev: 1,
              queuedAt: now,
            },
            k,
          );
        }
      }
      await tx.done;
    },

    async list() {
      const entries = (await (await db()).getAll(OUTBOX, range())) as OutboxEntry[];
      return entries.sort(byQueue);
    },

    async commit(projectId, sent, saved) {
      const tx = (await db()).transaction([OUTBOX, WORKING_COPY], 'readwrite');
      const outbox = tx.objectStore(OUTBOX);
      const mirror = tx.objectStore(WORKING_COPY);
      for (const s of sent) {
        const hit = saved.find((o) => o.id === s.id);
        if (hit === undefined) continue;
        const k = key(projectId, s.id);
        const now = (await outbox.get(k)) as OutboxEntry | undefined;
        if (now && now.rev === s.rev) await outbox.delete(k);
        else if (now) await outbox.put({ ...now, baseSeq: hit.updatedSeq }, k);
        if (s.value === null) await mirror.delete(k);
        else await mirror.put({ value: s.value, updatedSeq: hit.updatedSeq }, k);
        // EZD-299b Decided D-Resolves: the requeued row at a saved key goes in the same transaction.
        const ck = conflictKey(projectId, s.id);
        const row = (await outbox.get(ck)) as DeviceConflict | undefined;
        if (row?.state === 'requeued') await outbox.delete(ck);
      }
      await tx.done;
    },

    async drop(entries) {
      const tx = (await db()).transaction(OUTBOX, 'readwrite');
      for (const e of entries) {
        const k = key(e.projectId, e.id);
        const now = (await tx.store.get(k)) as OutboxEntry | undefined;
        if (now && now.rev === e.rev) await tx.store.delete(k);
      }
      await tx.done;
    },

    async replaceMirror(projectId: string, objects: LoadedObject[]) {
      const tx = (await db()).transaction(WORKING_COPY, 'readwrite');
      let cursor = await tx.store.openCursor(range());
      while (cursor) {
        if (cursor.key[2] === projectId) await cursor.delete();
        cursor = await cursor.continue();
      }
      for (const o of objects) {
        await tx.store.put(
          {
            value: { type: o.type, schemaVersion: o.schemaVersion, data: o.data },
            updatedSeq: o.updatedSeq,
          },
          key(projectId, o.id),
        );
      }
      await tx.done;
    },

    // EZD-299b Decided D-Move: an entry still at the sent rev leaves the outbox for the list, in one transaction.
    async moveToConflicts(moves, now) {
      const tx = (await db()).transaction(OUTBOX, 'readwrite');
      for (const m of moves) {
        const k = key(m.entry.projectId, m.entry.id);
        const entry = (await tx.store.get(k)) as OutboxEntry | undefined;
        if (entry === undefined || entry.rev !== m.entry.rev) continue;
        const ck = conflictKey(entry.projectId, entry.id);
        const existing = (await tx.store.get(ck)) as DeviceConflict | undefined;
        await tx.store.delete(k);
        const row: DeviceConflict = {
          projectId: entry.projectId,
          objectId: entry.id,
          reason: m.reason,
          baseSeq: entry.baseSeq,
          serverSeq: m.serverSeq,
          lockEpoch: entry.lockEpoch,
          value: entry.value,
          refusedAt: now,
          state: 'listed',
          server: m.reason === 'not_open' ? 'device' : 'pending',
          serverId: existing?.serverId ?? null,
        };
        await tx.store.put(row, ck);
      }
      await tx.done;
    },

    async listConflicts() {
      const rows = (await (await db()).getAll(OUTBOX, conflictRange(u, t))) as DeviceConflict[];
      return rows.sort(byRefusal);
    },

    // EZD-299b Decided D-Server: a missing row is an orphan; a newer refusal takes only the server id.
    async setConflictServer(updates) {
      const tx = (await db()).transaction(OUTBOX, 'readwrite');
      const orphans: ConflictOrphan[] = [];
      for (const up of updates) {
        const ck = conflictKey(up.projectId, up.objectId);
        const row = (await tx.store.get(ck)) as DeviceConflict | undefined;
        if (row === undefined) {
          orphans.push({ projectId: up.projectId, objectId: up.objectId, serverId: up.serverId });
        } else if (row.refusedAt === up.refusedAt) {
          await tx.store.put(
            {
              ...row,
              server: up.server,
              serverId: up.serverId ?? row.serverId,
              reason: up.reason ?? row.reason,
            },
            ck,
          );
        } else {
          await tx.store.put({ ...row, serverId: up.serverId ?? row.serverId }, ck);
        }
      }
      await tx.done;
      return orphans;
    },

    // EZD-299b Decided D-Guard: a number deletes only a stored row with that refusedAt, null deletes nothing,
    // absent deletes what is stored; returns the keys of stored rows kept for not matching.
    async deleteConflicts(keys) {
      const tx = (await db()).transaction(OUTBOX, 'readwrite');
      const kept: ConflictKey[] = [];
      for (const c of keys) {
        const ck = conflictKey(c.projectId, c.objectId);
        const stored = (await tx.store.get(ck)) as DeviceConflict | undefined;
        if (stored === undefined) continue;
        if (c.refusedAt === undefined || c.refusedAt === stored.refusedAt)
          await tx.store.delete(ck);
        else kept.push({ projectId: c.projectId, objectId: c.objectId });
      }
      await tx.done;
      return kept;
    },

    // EZD-299b Decided D-Requeue: the row is marked requeued and its change goes back in the outbox, unless a
    // newer refusal is stored at the key (Q-0648 (b)).
    async requeue(row, baseSeq, now) {
      const tx = (await db()).transaction(OUTBOX, 'readwrite');
      const ck = conflictKey(row.projectId, row.objectId);
      const stored = (await tx.store.get(ck)) as DeviceConflict | undefined;
      if (stored !== undefined && stored.refusedAt !== row.refusedAt) {
        await tx.done;
        return { kept: true };
      }
      await tx.store.put({ ...row, state: 'requeued' }, ck);
      const k = key(row.projectId, row.objectId);
      const entry = (await tx.store.get(k)) as OutboxEntry | undefined;
      if (entry) {
        await tx.store.put({ ...entry, baseSeq, rev: entry.rev + 1 }, k);
      } else {
        await tx.store.put(
          {
            projectId: row.projectId,
            id: row.objectId,
            baseSeq,
            lockEpoch: row.lockEpoch,
            value: row.value,
            rev: 1,
            queuedAt: now,
          },
          k,
        );
      }
      await tx.done;
      return { kept: false };
    },

    async setMirror(projectId, objectId, value, updatedSeq) {
      const tx = (await db()).transaction(WORKING_COPY, 'readwrite');
      const k = key(projectId, objectId);
      if (value === null) await tx.store.delete(k);
      else await tx.store.put({ value, updatedSeq }, k);
      await tx.done;
    },

    close() {
      const open = connection;
      connection = null;
      void open?.then(
        (d) => d.close(),
        () => {},
      );
    },
  };
}

// EZD-120b Build step 5 (vault/plans/EZD-120b.md section 3 storage row; Decided "Device database", "put",
// "commit, drop"; Q-0503; 03a; 03b rules 6, 9): the device outbox and the saved-object mirror in IndexedDB. Keys
// start with the app user and the company, and a storage reads only its own range, so one person's or one
// company's edits are never seen under another. One connection, opened on first use. Errors are thrown to the
// caller (outbox-sync.ts reports them).
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Change } from '../../editor/model/patches';
import type { LoadedObject, ObjectValue } from './model-api';
import type { Actor, OutboxEntry, OutboxStorage } from './outbox';

const DEVICE_DB = 'ezdraft-device';
const OUTBOX = 'outbox';
const WORKING_COPY = 'working_copy';

type DeviceKey = [string, string, string, string];
type MirrorRecord = { value: ObjectValue; updatedSeq: number };

interface DeviceDb extends DBSchema {
  outbox: { key: DeviceKey; value: OutboxEntry };
  working_copy: { key: DeviceKey; value: MirrorRecord };
}

const byQueue = (a: OutboxEntry, b: OutboxEntry) =>
  a.queuedAt - b.queuedAt ||
  (a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0) ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function createIdbOutboxStorage(actor: Actor): OutboxStorage {
  const u = actor.appUserId;
  const t = actor.tenantId;
  const key = (projectId: string, id: string): DeviceKey => [u, t, projectId, id];
  const range = () => IDBKeyRange.bound([u, t], [u, t, []]);
  let connection: Promise<IDBPDatabase<DeviceDb>> | null = null;

  const db = (): Promise<IDBPDatabase<DeviceDb>> => {
    if (connection === null) {
      const opening = openDB<DeviceDb>(DEVICE_DB, 1, {
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
        const old = await outbox.get(k);
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
      const entries = await (await db()).getAll(OUTBOX, range());
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
        const now = await outbox.get(k);
        if (now && now.rev === s.rev) await outbox.delete(k);
        else if (now) await outbox.put({ ...now, baseSeq: hit.updatedSeq }, k);
        if (s.value === null) await mirror.delete(k);
        else await mirror.put({ value: s.value, updatedSeq: hit.updatedSeq }, k);
      }
      await tx.done;
    },

    async drop(entries) {
      const tx = (await db()).transaction(OUTBOX, 'readwrite');
      for (const e of entries) {
        const k = key(e.projectId, e.id);
        const now = await tx.store.get(k);
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
          { value: { type: o.type, schemaVersion: o.schemaVersion, data: o.data }, updatedSeq: o.updatedSeq },
          key(projectId, o.id),
        );
      }
      await tx.done;
    },

    close() {
      const open = connection;
      connection = null;
      void open?.then((d) => d.close(), () => {});
    },
  };
}

// EZD-1402 (phase-14 EZD-1402; 03b Architecture rule 9 "One outbox ... The outbox is never evicted"; Q-0503): the
// device's queued field actions and their photo blobs, in the device database's outbox store under the field key
// range of one user and company (device-db.ts). One connection, opened on first use; errors go to the caller.
import { openDB, type IDBPDatabase } from 'idb';
import {
  actorRange,
  DEVICE_DB,
  DEVICE_DB_VERSION,
  FIELD_KEY_PART,
  fieldRange,
  OUTBOX_STORE,
  WORKING_COPY_STORE,
} from './device-db';
import {
  byQueuedAt,
  readout,
  type FieldAction,
  type NewFieldAction,
  type QueueReadout,
} from './field-action';
import type { Actor, OutboxEntry } from './outbox';

export type FieldQueue = {
  add(action: NewFieldAction, now?: number): Promise<FieldAction>;
  // Oldest first, refused ones included.
  list(): Promise<FieldAction[]>;
  remove(action: Pick<FieldAction, 'projectId' | 'id'>): Promise<void>;
  refuse(action: Pick<FieldAction, 'projectId' | 'id'>, code: string): Promise<void>;
  // Queued model edits and field actions of this user and company: how many, and their size in bytes.
  readout(): Promise<QueueReadout>;
  close(): void;
};

type FieldKey = [string, string, string, string, string];

const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

export function createFieldQueue(actor: Actor, newId: () => string = () => crypto.randomUUID()): FieldQueue {
  const u = actor.appUserId;
  const t = actor.tenantId;
  const key = (projectId: string, id: string): FieldKey => [FIELD_KEY_PART, u, t, projectId, id];
  let connection: Promise<IDBPDatabase> | null = null;

  const db = (): Promise<IDBPDatabase> => {
    if (connection === null) {
      const opening = openDB(DEVICE_DB, DEVICE_DB_VERSION, {
        // The same stores as outbox-idb.ts, whichever opens the database first.
        upgrade(d) {
          d.createObjectStore(OUTBOX_STORE);
          d.createObjectStore(WORKING_COPY_STORE);
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

  const list = async (): Promise<FieldAction[]> => {
    const rows = (await (await db()).getAll(OUTBOX_STORE, fieldRange(u, t))) as FieldAction[];
    return rows.sort(byQueuedAt);
  };

  return {
    async add(a, now = Date.now()) {
      const action: FieldAction = {
        id: newId(),
        projectId: a.projectId,
        kind: a.kind,
        ops: a.ops,
        baseVersionId: a.baseVersionId ?? null,
        queuedAt: now,
        photo: a.photo ?? null,
        state: 'queued',
        refusal: null,
      };
      await (await db()).put(OUTBOX_STORE, action, key(action.projectId, action.id));
      return action;
    },
    list,
    async remove(a) {
      await (await db()).delete(OUTBOX_STORE, key(a.projectId, a.id));
    },
    async refuse(a, code) {
      const tx = (await db()).transaction(OUTBOX_STORE, 'readwrite');
      const k = key(a.projectId, a.id);
      const row = (await tx.store.get(k)) as FieldAction | undefined;
      if (row) await tx.store.put({ ...row, state: 'refused', refusal: code }, k);
      await tx.done;
    },
    async readout() {
      const d = await db();
      const edits = (await d.getAll(OUTBOX_STORE, actorRange(u, t))) as OutboxEntry[];
      const actions = readout(await list());
      return {
        count: edits.length + actions.count,
        bytes: edits.reduce((sum, e) => sum + jsonBytes(e), 0) + actions.bytes,
      };
    },
    close() {
      void connection?.then(
        (d) => d.close(),
        () => {},
      );
      connection = null;
    },
  };
}

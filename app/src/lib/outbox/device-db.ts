// EZD-120d Build step 1 (vault/plans/EZD-120d.md section 3 device-db row; Decided "countQueued"; Q-0503): the
// device database's name, store and key range, shared by the outbox storage and the sign-out check, and a count
// of one person's queued edits that never creates the database. No idb: plain IndexedDB, one short connection.
export const DEVICE_DB = 'ezdraft-device';
export const DEVICE_DB_VERSION = 1;
export const OUTBOX_STORE = 'outbox';

// Outbox keys are user, company, project, object (EZD-120b); this range holds one actor's entries.
export function actorRange(appUserId: string, tenantId: string): IDBKeyRange {
  return IDBKeyRange.bound([appUserId, tenantId], [appUserId, tenantId, []]);
}

// EZD-299b Build step 1 (vault/plans/EZD-299b.md Decided D-Key): conflict rows live in the outbox store under
// keys that start with this part, so they sit outside every actor's range.
export const CONFLICT_KEY_PART = 'conflict';

// One actor's conflict rows: keys conflict, user, company, project, object.
export function conflictRange(appUserId: string, tenantId: string): IDBKeyRange {
  return IDBKeyRange.bound(
    [CONFLICT_KEY_PART, appUserId, tenantId],
    [CONFLICT_KEY_PART, appUserId, tenantId, []],
  );
}

// null when the count cannot be read (an error or a blocked open); 0 when there is no database or no store.
export function countQueued(
  appUserId: string,
  tenantId: string,
  factory?: IDBFactory,
): Promise<number | null> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = (factory ?? indexedDB).open(DEVICE_DB);
    } catch {
      resolve(null);
      return;
    }
    let missing = false;
    request.onupgradeneeded = () => {
      // The database did not exist: abort so it is not created.
      missing = true;
      request.transaction?.abort();
    };
    request.onblocked = () => resolve(null);
    request.onerror = (event) => {
      event.preventDefault();
      resolve(missing ? 0 : null);
    };
    request.onsuccess = () => {
      const db = request.result;
      try {
        if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
          db.close();
          resolve(0);
          return;
        }
        const count = db
          .transaction(OUTBOX_STORE, 'readonly')
          .objectStore(OUTBOX_STORE)
          .count(actorRange(appUserId, tenantId));
        count.onsuccess = () => {
          db.close();
          resolve(count.result);
        };
        count.onerror = () => {
          db.close();
          resolve(null);
        };
      } catch {
        db.close();
        resolve(null);
      }
    };
  });
}

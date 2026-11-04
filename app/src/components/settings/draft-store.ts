// EZD-103b Step 6 (vault/plans/EZD-103b.md Decided "Draft store"; Q-0302; 02 Named tools Device storage): the
// IndexedDB store for Settings drafts, the only file importing idb. A failure is reported with its location
// and the call still resolves (read with null), so the page never breaks; no connection is kept open.
import { openDB } from 'idb';
import type { DBSchema } from 'idb';
import { toDraftRecord } from '../../lib/settings/draft';
import type { DraftRecord, DraftStore } from '../../lib/settings/draft';

export const SETTINGS_DRAFT_DB = 'ezdraft-settings-drafts';
export const SETTINGS_DRAFT_STORE = 'drafts';

interface SettingsDraftDb extends DBSchema {
  drafts: { key: string; value: DraftRecord };
}

function open() {
  return openDB<SettingsDraftDb>(SETTINGS_DRAFT_DB, 1, {
    upgrade(db) {
      db.createObjectStore(SETTINGS_DRAFT_STORE);
    },
  });
}

async function report(error: unknown): Promise<void> {
  const { captureBrowserError } = await import('../../lib/errors/capture');
  captureBrowserError(error, 'settings.draft');
}

export function createIdbDraftStore(): DraftStore {
  return {
    async read(key) {
      try {
        const db = await open();
        const stored = await db.get(SETTINGS_DRAFT_STORE, key);
        db.close();
        return toDraftRecord(stored);
      } catch (error) {
        await report(error);
        return null;
      }
    },
    async write(key, record) {
      try {
        const db = await open();
        await db.put(SETTINGS_DRAFT_STORE, record, key);
        db.close();
      } catch (error) {
        await report(error);
      }
    },
    async clear(key) {
      try {
        const db = await open();
        await db.delete(SETTINGS_DRAFT_STORE, key);
        db.close();
      } catch (error) {
        await report(error);
      }
    },
  };
}

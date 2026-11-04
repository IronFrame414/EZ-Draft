// EZD-103b Step 5 (vault/plans/EZD-103b.md Decided "Draft helpers"; Q-0302): unsaved Settings edits kept on
// this device. Plain module, no React and no IndexedDB; the store is passed in (draft-store.ts in the browser).
import type { SettingsSectionId } from './sections';

export type DraftRecord = { value: unknown };

export type DraftStore = {
  read(key: string): Promise<DraftRecord | null>;
  write(key: string, record: DraftRecord): Promise<void>;
  clear(key: string): Promise<void>;
};

export type DraftPage = SettingsSectionId | 'dev_sample';

export function draftKey(scope: string, page: DraftPage): string {
  return `${scope}:${page}`;
}

export async function restoreDraft<T>(
  store: DraftStore,
  key: string,
  hasEdits: () => boolean,
  restore: (value: T) => void,
): Promise<'restored' | 'none' | 'skipped'> {
  const record = await store.read(key);
  if (record === null) return 'none';
  if (hasEdits()) return 'skipped';
  restore(record.value as T);
  return 'restored';
}

export async function syncDraft(
  store: DraftStore,
  key: string,
  value: unknown,
  hadValue: boolean,
): Promise<'written' | 'cleared' | 'none'> {
  if (value !== null) {
    await store.write(key, { value });
    return 'written';
  }
  if (hadValue) {
    await store.clear(key);
    return 'cleared';
  }
  return 'none';
}

export function toDraftRecord(stored: unknown): DraftRecord | null {
  if (
    typeof stored === 'object' &&
    stored !== null &&
    !Array.isArray(stored) &&
    Object.prototype.hasOwnProperty.call(stored, 'value')
  ) {
    return { value: (stored as { value: unknown }).value };
  }
  return null;
}

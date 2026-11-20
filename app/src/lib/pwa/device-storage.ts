// EZD-134 (03b Architecture rule 10 "The app asks the browser for persistent storage and shows the answer in
// Settings"): asks once per page load and reads the answer for Settings > System status. Never throws.
export type Persistence = 'kept' | 'may_clear' | 'unsupported';

type Storage = Partial<Pick<StorageManager, 'persist' | 'persisted'>>;

const browserStorage = (): Storage | undefined =>
  typeof navigator === 'undefined' ? undefined : navigator.storage;

// The browser's current answer: kept (persistent), may_clear (best effort) or unsupported (no Storage API).
export async function readPersistence(storage: Storage | undefined = browserStorage()): Promise<Persistence> {
  if (!storage || typeof storage.persisted !== 'function') return 'unsupported';
  try {
    return (await storage.persisted()) ? 'kept' : 'may_clear';
  } catch {
    return 'may_clear';
  }
}

// Asks for persistent storage unless it is already granted; the answer is the browser's.
export async function requestPersistentStorage(
  storage: Storage | undefined = browserStorage(),
): Promise<Persistence> {
  const now = await readPersistence(storage);
  if (now !== 'may_clear' || typeof storage?.persist !== 'function') return now;
  try {
    return (await storage.persist()) ? 'kept' : 'may_clear';
  } catch {
    return 'may_clear';
  }
}

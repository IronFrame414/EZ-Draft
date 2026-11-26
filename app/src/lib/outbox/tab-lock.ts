// EZD-1998 (AC-EZD-1998-2): one lock per user and company across the browser's tabs, shared by the office autosave
// (outbox-sync.ts, which re-exports it) and the field sender (field-sync.ts). Moved here unchanged from outbox-sync.ts
// so the field pages' sender does not load the office autosave.
export type TabLock = {
  tryRun<T>(name: string, fn: () => Promise<T>): Promise<{ ran: true; value: T } | { ran: false }>;
};

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

// EZD-102 U4 (vault/plans/EZD-102.md section 4). Expected values: Decided "Store refresh" (one fetch in
// flight; calls during it set one pending flag that runs one more fetch after it settles; success replaces
// the set, filtered by isPermissionKey, and notifies only on a content change; a rejected fetch keeps the
// set and notifies nobody). The fetch is a manual-resolve stub; no network.
import { describe, expect, it } from 'vitest';
import type { PermissionKey } from './catalog';
import { createPermissionStore } from './permission-store';

type Deferred = {
  resolve: (keys: readonly PermissionKey[]) => void;
  reject: (e: unknown) => void;
};

function manualFetch() {
  const calls: Deferred[] = [];
  const fetchPermissions = () =>
    new Promise<readonly PermissionKey[]>((resolve, reject) => {
      calls.push({ resolve, reject });
    });
  return { calls, fetchPermissions };
}

// Lets settled promises and their follow-up fetches run.
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('EZD-102 permission store', () => {
  it('U4 (a) one refresh replaces the set and notifies once', async () => {
    const f = manualFetch();
    const store = createPermissionStore(['view_projects'], f.fetchPermissions);
    let notified = 0;
    store.subscribe(() => {
      notified++;
    });
    const done = store.refresh();
    await flush();
    expect(f.calls).toHaveLength(1);
    f.calls[0].resolve(['edit_model']);
    await done;
    await flush();
    expect([...store.get()]).toEqual(['edit_model']);
    expect(notified).toBe(1);
  });

  it('U4 (b) three refreshes during one in flight make two fetches in total', async () => {
    const f = manualFetch();
    const store = createPermissionStore(['view_projects'], f.fetchPermissions);
    const all = [store.refresh()];
    await flush();
    expect(f.calls).toHaveLength(1);
    all.push(store.refresh(), store.refresh(), store.refresh());
    await flush();
    expect(f.calls).toHaveLength(1);
    f.calls[0].resolve(['view_projects']);
    await flush();
    await flush();
    expect(f.calls).toHaveLength(2);
    f.calls[1].resolve(['view_projects']);
    await Promise.allSettled(all);
    await flush();
    expect(f.calls).toHaveLength(2);
  });

  it('U4 (c) a rejected fetch keeps the set and notifies nobody', async () => {
    const f = manualFetch();
    const store = createPermissionStore(['view_projects'], f.fetchPermissions);
    let notified = 0;
    store.subscribe(() => {
      notified++;
    });
    const done = store.refresh().catch(() => 'rejected');
    await flush();
    f.calls[0].reject(new Error('permissions_refused'));
    await done;
    await flush();
    expect([...store.get()]).toEqual(['view_projects']);
    expect(notified).toBe(0);
  });

  it('U4 (d) the same set notifies nobody', async () => {
    const f = manualFetch();
    const store = createPermissionStore(['view_projects'], f.fetchPermissions);
    let notified = 0;
    store.subscribe(() => {
      notified++;
    });
    const done = store.refresh();
    await flush();
    f.calls[0].resolve(['view_projects']);
    await done;
    await flush();
    expect([...store.get()]).toEqual(['view_projects']);
    expect(notified).toBe(0);
  });
});

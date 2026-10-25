// EZD-103b U13 (vault/plans/EZD-103b.md sections 1, 3, 4; AC-EZD-103-5).
// Expected values: plan section 4 row U13; section 1 Decided "Draft helpers" (Q-0302). The fake store is a
// Map<string, DraftRecord> behind the three DraftStore methods, recording calls (section 3).
import { describe, expect, it, vi } from 'vitest';
import { draftKey, restoreDraft, syncDraft, toDraftRecord } from './draft';
import type { DraftRecord, DraftStore } from './draft';

function fakeStore(initial: [string, DraftRecord][] = []) {
  const map = new Map<string, DraftRecord>(initial);
  const calls: [string, ...unknown[]][] = [];
  const store: DraftStore = {
    read: vi.fn(async (key: string) => {
      calls.push(['read', key]);
      return map.get(key) ?? null;
    }),
    write: vi.fn(async (key: string, record: DraftRecord) => {
      calls.push(['write', key, record]);
      map.set(key, record);
    }),
    clear: vi.fn(async (key: string) => {
      calls.push(['clear', key]);
      map.delete(key);
    }),
  };
  return { map, calls, store };
}

const KEY = 'm1:company';

describe('EZD-103b draft helpers', () => {
  it('U13 draftKey', () => {
    expect(draftKey('m1', 'company')).toBe('m1:company');
    expect(draftKey('m1', 'dev_sample')).toBe('m1:dev_sample');
  });

  it('U13 (a) restoreDraft on an empty store: none, restore not called', async () => {
    const f = fakeStore();
    const restore = vi.fn();
    await expect(restoreDraft(f.store, KEY, () => false, restore)).resolves.toBe('none');
    expect(restore).toHaveBeenCalledTimes(0);
  });

  it('U13 (b) restoreDraft with a stored value and no edits: restored once with the value', async () => {
    const f = fakeStore([[KEY, { value: { a: 1 } }]]);
    const restore = vi.fn();
    await expect(restoreDraft(f.store, KEY, () => false, restore)).resolves.toBe('restored');
    expect(restore).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledWith({ a: 1 });
  });

  it('U13 (c) restoreDraft with a stored value while edits exist: skipped, restore not called', async () => {
    const f = fakeStore([[KEY, { value: { a: 1 } }]]);
    const restore = vi.fn();
    await expect(restoreDraft(f.store, KEY, () => true, restore)).resolves.toBe('skipped');
    expect(restore).toHaveBeenCalledTimes(0);
  });

  it('U13 (d) syncDraft with a value: written, the map holds it', async () => {
    const f = fakeStore();
    await expect(syncDraft(f.store, KEY, { a: 1 }, false)).resolves.toBe('written');
    expect(f.map.get(KEY)).toEqual({ value: { a: 1 } });
  });

  it('U13 (e) syncDraft null after a value: cleared, clear once', async () => {
    const f = fakeStore([[KEY, { value: { a: 1 } }]]);
    await expect(syncDraft(f.store, KEY, null, true)).resolves.toBe('cleared');
    expect(f.store.clear).toHaveBeenCalledTimes(1);
  });

  it('U13 (f) syncDraft null with no earlier value: none, no store call', async () => {
    const f = fakeStore();
    await expect(syncDraft(f.store, KEY, null, false)).resolves.toBe('none');
    expect(f.calls).toEqual([]);
  });

  it('U13 (g) toDraftRecord', () => {
    expect(toDraftRecord({ value: 1 })).toEqual({ value: 1 });
    expect(toDraftRecord({ value: null })).toEqual({ value: null });
    for (const stored of [null, 'x', {}, [1], undefined]) {
      expect(toDraftRecord(stored), JSON.stringify(stored) ?? 'undefined').toBeNull();
    }
  });
});

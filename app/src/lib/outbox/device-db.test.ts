// EZD-120d U1 (vault/plans/EZD-120d.md sections 3 and 4; AC-EZD-120d-3; Q-0503). `countQueued` on fake-indexeddb,
// a new IDBFactory per test. Expected values: no device database means 0 and none is made; otherwise the number
// of outbox entries of exactly that app user and company (the key range of section 3).
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { v } from '../../../test-harness/outbox/sync-support';
import { countQueued, DEVICE_DB, DEVICE_DB_VERSION, OUTBOX_STORE } from './device-db';
import type { Actor } from './outbox';
import { createIdbOutboxStorage } from './outbox-idb';

const actor = (appUserId: string, tenantId: string): Actor => ({
  appUserId,
  tenantId,
  membershipId: `m-${appUserId}-${tenantId}`,
});

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('EZD-120d device database count', () => {
  it('U1 names the device database as the outbox storage does', () => {
    expect(DEVICE_DB).toBe('ezdraft-device');
    expect(DEVICE_DB_VERSION).toBe(1);
    expect(OUTBOX_STORE).toBe('outbox');
  });

  it('U1 countQueued is 0 and makes no database when there is none', async () => {
    const factory = new IDBFactory();
    expect(await countQueued('u1', 't1', factory)).toBe(0);
    expect(await factory.databases()).toEqual([]);
  });

  it('U1 countQueued counts only the entries of that user and company', async () => {
    const factory = new IDBFactory();
    globalThis.indexedDB = factory;
    const rows: [Actor, string[]][] = [
      [actor('u1', 't1'), ['A', 'B']],
      [actor('u2', 't1'), ['A']],
    ];
    for (const [who, ids] of rows) {
      const s = createIdbOutboxStorage(who);
      await s.put(
        'p',
        0,
        ids.map((id) => ({ id, value: v(1) })),
        100,
      );
      s.close();
    }
    expect(await countQueued('u1', 't1', factory)).toBe(2);
    expect(await countQueued('u2', 't1', factory)).toBe(1);
    expect(await countQueued('u1', 't2', factory)).toBe(0);
  });
});

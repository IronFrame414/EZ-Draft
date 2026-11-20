// EZD-220 (AC-EZD-220-4; 03b rule 9; Q-0704 05-screens "offline, the change queues in the outbox"). A pin placed from
// the Fixtures panel while offline is held in the device outbox and sent once the device is back online, as any model
// edit is (EZD-120b U6). Fake timers, in-memory storage and a fetch stub; nothing leaves the process.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  alwaysLock,
  createMemoryStorage,
  createOnline,
  readCall,
  savedResponse,
  type SentCall,
} from '../../../test-harness/outbox/sync-support';
import { createOutboxSync } from '../../lib/outbox/outbox-sync';
import { pinChoice, placeFixture } from './fixture-tool';
import { F1, idSeq } from './test-utils/fixtures';

const P = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('EZD-220 a pin placed offline', () => {
  it('AC-4 queues in the outbox and is sent when the device is back online', async () => {
    const storage = createMemoryStorage();
    const online = createOnline(false);
    const sent: SentCall[] = [];
    const fetchImpl = vi.fn(async (input: unknown, init?: RequestInit) => {
      const call = await readCall(input, init);
      sent.push(call);
      return savedResponse(call);
    });
    const sync = createOutboxSync({
      actor: { appUserId: 'u1', tenantId: 't1', membershipId: 'm1' },
      storage,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lock: alwaysLock,
      online: online.source,
    });
    const change = placeFixture(
      pinChoice('protect'),
      { x: 30, y: 60 },
      {
        level: F1,
        objects: [],
        newId: idSeq(700),
      },
    );
    expect(change).not.toBeNull();
    void sync.enqueue(P, 0, [change!]);
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchImpl).toHaveBeenCalledTimes(0);
    expect(sync.getState().status).toBe('offline');
    expect((await storage.list()).map((e) => e.id)).toEqual([change!.id]);

    online.set(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [sentChange] = sent[0]!.body.changes as unknown as {
      id: string;
      type: string;
      data: { status: string; attributes: unknown };
    }[];
    expect(sentChange).toMatchObject({
      id: change!.id,
      type: 'pin',
      data: { status: 'existing', attributes: { kind: 'protect', photoFileId: null } },
    });
    sync.dispose();
  });
});

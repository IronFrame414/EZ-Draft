// EZD-120d U3 (vault/plans/EZD-120d.md section 4, Build step 4; AC-EZD-120d-3). Fake timers, an in-memory
// storage and a fetch stub. Expected value: every save POST sends `x-ezdraft-membership` with the actor's
// membership id (Decided "Membership check").
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  alwaysLock,
  createMemoryStorage,
  readCall,
  savedResponse,
  v,
} from '../../../test-harness/outbox/sync-support';
import { MEMBERSHIP_HEADER, type Actor } from './outbox';
import { createOutboxSync } from './outbox-sync';

const actor: Actor = { appUserId: 'u1', tenantId: 't1', membershipId: 'm1' };
const P = '11111111-1111-4111-8111-111111111111';
const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('EZD-120d save request header', () => {
  it('U3 names the header x-ezdraft-membership', () => {
    expect(MEMBERSHIP_HEADER).toBe('x-ezdraft-membership');
  });

  it('U3 both saves send the membership header', async () => {
    const seen: (string | null)[] = [];
    const fetchImpl = vi.fn(async (input: unknown, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get('x-ezdraft-membership'));
      return savedResponse(await readCall(input, init));
    });
    const sync = createOutboxSync({
      actor,
      storage: createMemoryStorage(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lock: alwaysLock,
    });

    void sync.enqueue(P, 0, [{ id: idOf(1), value: v(1) }]);
    await vi.advanceTimersByTimeAsync(2000);
    void sync.enqueue(P, 0, [{ id: idOf(2), value: v(2) }]);
    await vi.advanceTimersByTimeAsync(2000);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(seen).toEqual(['m1', 'm1']);
    sync.dispose();
  });
});

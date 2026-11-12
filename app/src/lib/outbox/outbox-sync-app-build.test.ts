// EZD-299a T15 (vault/plans/EZD-299a.md section 4; AC-EZD-299-14). Fake timers, an in-memory storage and a
// fetch stub, as outbox-sync-header.test.ts. Expected value: every save POST sends `x-ezdraft-app-build` with
// the build number (Decided D-Build); the env value is '300'.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  alwaysLock,
  createMemoryStorage,
  readCall,
  savedResponse,
  v,
} from '../../../test-harness/outbox/sync-support';
import { APP_BUILD_HEADER } from '../app-version';
import { type Actor } from './outbox';
import { createOutboxSync } from './outbox-sync';

const actor: Actor = { appUserId: 'u1', tenantId: 't1', membershipId: 'm1' };
const P = '11111111-1111-4111-8111-111111111111';
const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.stubEnv('EZD_APP_BUILD', '300');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('EZD-299a save request app build header', () => {
  it('EZD-299a T15 the header is named x-ezdraft-app-build', () => {
    expect(APP_BUILD_HEADER).toBe('x-ezdraft-app-build');
  });

  it('EZD-299a T15 a save sends the build number in the header', async () => {
    const seen: (string | null)[] = [];
    const fetchImpl = vi.fn(async (input: unknown, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get('x-ezdraft-app-build'));
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

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(['300']);
    sync.dispose();
  });
});

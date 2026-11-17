// EZD-125 (ARCH Realtime "Resync", "Requests only on events"; 11 rule 11; Q-0697 decisions 05; 09o lock_epoch
// row 5): the lock controller refetches once per lock event and once per resync, with no timer, and picks the
// own wording for a save refused after the viewer's other device released.
import { describe, expect, it, vi } from 'vitest';
import { createLockController, type LockEvent } from './lock-controller';

const P = '11111111-1111-4111-8111-111111111111';
const ME = 'a';
const state = (holder: string | null, epoch: number) => ({
  lockEpoch: epoch,
  holder: holder ? { appUserId: holder, name: holder === ME ? 'Ana' : 'Ben' } : null,
  since: holder ? 's' : null,
  offline: false,
  myRequest: null,
  requests: [],
  now: 'n',
});

function harness(first = state(ME, 1)) {
  let current = first;
  const fetchImpl = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
    if ((init?.method ?? 'GET') === 'GET') return Response.json({ lock: current }, { status: 200 });
    return Response.json({ status: 'kept', lock: { lockEpoch: 1 } }, { status: 200 });
  });
  let emit: (e: LockEvent | null) => void = () => {};
  const stop = vi.fn();
  const events = vi.fn((_p: string, cb: (e: LockEvent | null) => void) => {
    emit = cb;
    return stop;
  });
  const c = createLockController({ projectId: P, appUserId: ME, events, fetchImpl });
  return {
    c,
    fetchImpl,
    stop,
    emit: (e: LockEvent | null) => emit(e),
    set: (s: ReturnType<typeof state>) => {
      current = s;
    },
    gets: () => fetchImpl.mock.calls.filter((x) => (x[1]?.method ?? 'GET') === 'GET').length,
  };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('EZD-125 lock controller', () => {
  it('reads at start, then once per lock event and once per resync', async () => {
    const h = harness();
    await settle();
    expect(h.gets()).toBe(1);
    expect(h.c.get()).toMatchObject({ status: 'ready', mine: true });
    h.set(state('b', 3));
    h.emit({
      name: 'lock.acquired',
      payload: { holderAppUserId: 'b', lockEpoch: 3, since: 's' },
    });
    await settle();
    expect(h.gets()).toBe(2);
    expect(h.c.get()).toMatchObject({ mine: false, lock: { holder: { name: 'Ben' } } });
    h.emit(null);
    await settle();
    expect(h.gets()).toBe(3);
    h.c.dispose();
    expect(h.stop).toHaveBeenCalledTimes(1);
  });

  it('Keep editing answers through the respond route and refetches', async () => {
    const h = harness();
    await settle();
    expect(await h.c.keepEditing('r1')).toEqual({ ok: true, status: 'kept', lockEpoch: 1 });
    const post = h.fetchImpl.mock.calls.find((x) => x[1]?.method === 'POST');
    expect(String(post?.[0])).toBe(`/api/projects/${P}/lock/respond`);
    expect(post?.[1]?.body).toBe('{"requestId":"r1","response":"keep"}');
  });

  it('Release from the prompt drains first', async () => {
    const h = harness();
    await settle();
    const order: string[] = [];
    h.fetchImpl.mockImplementationOnce(async () => {
      order.push('respond');
      return Response.json({ status: 'released', lock: { lockEpoch: 2 } }, { status: 200 });
    });
    await h.c.release('r1', async () => {
      order.push('drain');
    });
    expect(order).toEqual(['drain', 'respond']);
  });

  it('09o lock_epoch row 5: after the viewer’s own other device released, a refused save gets its own wording', async () => {
    const h = harness();
    await settle();
    expect(h.c.staleSaveMessageKey()).toBe('error.stale_lock_epoch');
    h.emit({
      name: 'lock.released',
      payload: { formerHolderAppUserId: ME, lockEpoch: 2, reason: 'stop_editing', at: 't' },
    });
    expect(h.c.staleSaveMessageKey()).toBe('error.lock_released_other_device');
    h.emit({
      name: 'lock.acquired',
      payload: { holderAppUserId: 'b', lockEpoch: 3, since: 's' },
    });
    expect(h.c.staleSaveMessageKey()).toBe('error.stale_lock_epoch');
    h.c.dispose();
  });
});

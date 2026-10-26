// EZD-184 T3 (vault/plans/EZD-184.md Tests; Step 3): after a session.ended push the hub still sends the
// person to /sign-in once. This is a behavior guard: it passes before and after the lint fix (plan D2).
// The real adapter is replaced by the fake adapter of EZD-018 (plan D7); fetch and window are stubbed.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { flush, type FakeAdapter } from '../../../test-harness/realtime/fake-adapter';
import type { RealtimeToken } from './adapter';
import { getRealtimeHub } from './index';

const h = vi.hoisted(() => ({ adapter: undefined as FakeAdapter | undefined }));
vi.mock('./adapter', async () => {
  const { createFakeAdapter } = await import('../../../test-harness/realtime/fake-adapter');
  return { createSupabaseRealtimeAdapter: () => (h.adapter = createFakeAdapter()) };
});

const SELF = randomUUID();
const TOKEN: RealtimeToken = {
  url: 'http://127.0.0.1:54321',
  apiKey: 'publishable-test-key',
  accessToken: 't1',
  expiresAt: 4_102_444_800,
  appUserId: SELF,
};

describe('EZD-184 realtime hub sign-out redirect', () => {
  const assign = vi.fn();
  const fetchMock = vi.fn(async () => ({
    status: 200,
    json: async () => TOKEN,
  }));

  beforeAll(() => {
    vi.stubGlobal('window', Object.assign(new EventTarget(), { location: { assign } }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('EZD-184 T3 session.ended still sends the person to /sign-in', async () => {
    const u = getRealtimeHub().user();
    await flush();

    expect(u.status).toBe('subscribed');
    expect(assign).toHaveBeenCalledTimes(0);
    const fetchCalls: unknown[][] = fetchMock.mock.calls;
    expect(fetchCalls[0][0]).toBe('/api/realtime/token');

    const channels = h.adapter!.channels.filter((c) => c.topic === `user:${SELF}`);
    expect(channels).toHaveLength(1);
    channels[0].emit('session.ended', {});
    await flush();

    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('/sign-in');
  });
});

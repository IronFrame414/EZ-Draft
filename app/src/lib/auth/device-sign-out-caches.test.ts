// EZD-134 (security: the service worker's cached pages hold the signed-in person's data): sign-out deletes the
// app caches before it signs out, online and offline, and a failed delete never stops the sign-out.
import { describe, expect, it, vi } from 'vitest';
import { signOutOnDevice } from './device-sign-out';

const env = (order: string[], clear: () => Promise<unknown>) => ({
  document: { cookie: '' },
  location: { protocol: 'http:', replace: vi.fn(() => void order.push('replace')) },
  clearCaches: clear,
});

describe('EZD-134 sign-out clears the app caches', () => {
  it('online: caches first, then the sign-out', async () => {
    const order: string[] = [];
    await signOutOnDevice(
      async () => void order.push('action'),
      env(order, async () => void order.push('clear')),
    );
    expect(order).toEqual(['clear', 'action']);
  });

  it('offline: caches first, then the marker and /sign-in', async () => {
    const order: string[] = [];
    const e = env(order, async () => void order.push('clear'));
    await signOutOnDevice(async () => {
      order.push('action');
      throw new TypeError('Failed to fetch');
    }, e);
    expect(order).toEqual(['clear', 'action', 'replace']);
    expect(e.document.cookie).toContain('=1');
  });

  it('a failed delete still signs out', async () => {
    const action = vi.fn(async () => undefined);
    await signOutOnDevice(action, env([], () => Promise.reject(new Error('x'))));
    expect(action).toHaveBeenCalledTimes(1);
  });
});

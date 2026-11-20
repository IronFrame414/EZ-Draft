// EZD-134: sign-out deletes this app's caches only (cached pages hold the signed-in person's data).
import { describe, expect, it } from 'vitest';
import { clearAppCaches } from './clear-caches';

describe('EZD-134 clearAppCaches', () => {
  it('deletes every ezdraft- cache and nothing else', async () => {
    const names = new Set(['ezdraft-shell', 'ezdraft-static', 'ezdraft-projects', 'other-app']);
    const store = {
      keys: async () => [...names],
      delete: async (n: string) => names.delete(n),
    };
    expect(await clearAppCaches(store)).toBe(3);
    expect([...names]).toEqual(['other-app']);
  });

  it('never throws', async () => {
    expect(await clearAppCaches(undefined)).toBe(0);
    expect(
      await clearAppCaches({ keys: () => Promise.reject(new Error('x')), delete: async () => true }),
    ).toBe(0);
  });
});

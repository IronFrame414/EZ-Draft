// EZD-018 T21 (vault/plans/EZD-018.md Tests; Step 6): the Realtime test page is not found in production.
// Pattern app/src/app/dev/device/page.test.tsx (EZD-010c, EZD-014c).
import { afterEach, describe, expect, it, vi } from 'vitest';
import Page from './page';

describe('EZD-018 realtime test page', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('EZD-018 T21 not found in production', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    let digest: string | undefined;
    try {
      await Page({ searchParams: Promise.resolve({}) });
    } catch (e) {
      digest = (e as { digest?: string }).digest;
    }
    expect(digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
  });
});

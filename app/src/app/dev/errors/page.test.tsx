// EZD-024 T20 (vault/plans/EZD-024.md Tests; Step 11): the error test page is not found in production.
// Pattern app/src/app/dev/jobs/page.test.tsx (EZD-009 T18; EZD-010 T4).
import { afterEach, describe, expect, it, vi } from 'vitest';
import Page from './page';

describe('EZD-024 error test page', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('EZD-024 T20 the page is not found in production', async () => {
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

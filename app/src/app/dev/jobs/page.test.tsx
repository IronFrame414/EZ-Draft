// EZD-009 T18, page part (vault/plans/EZD-009.md Tests; Step 7): the jobs test page is not found in
// production. Pattern app/src/app/dev/realtime/page.test.tsx (EZD-018 T21; EZD-010 T4).
import { afterEach, describe, expect, it, vi } from 'vitest';
import Page from './page';

describe('EZD-009 jobs test page', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('EZD-009 T18 the page is not found in production', async () => {
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

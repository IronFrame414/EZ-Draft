// EZD-132 T18, page part (vault/plans/EZD-132.md section 4; Step 13): the storage test page is not found in
// production. Pattern app/src/app/dev/jobs/page.test.tsx (EZD-009 T18).
import { afterEach, describe, expect, it, vi } from 'vitest';
import Page from './page';

describe('EZD-132 storage test page', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('EZD-132 T18 the page is not found in production', async () => {
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

// EZD-110a T16 (vault/plans/EZD-110a.md section 4; AC-EZD-110-8): the notifications test page is not found in
// production. Pattern app/src/app/dev/jobs/page.test.tsx (EZD-009 T18); the page takes searchParams.
import { afterEach, describe, expect, it, vi } from 'vitest';
import Page from './page';

describe('EZD-110a notifications test page', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('EZD-110a T16 the page is not found in production', async () => {
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

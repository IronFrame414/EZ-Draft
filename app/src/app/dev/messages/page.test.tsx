// EZD-026b B4 (vault/plans/EZD-026b.md Tests).
import { afterEach, describe, expect, it, vi } from 'vitest';

const getRequestLanguage = vi.fn();
vi.mock('../../../server/messages/request-language', () => ({
  getRequestLanguage: (...a: unknown[]) => getRequestLanguage(...a),
}));

import Page from './page';

describe('EZD-026b messages test page', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    getRequestLanguage.mockReset();
  });

  it('EZD-026b B4 test page is not found in production', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    let digest: string | undefined;
    try {
      await Page();
    } catch (e) {
      digest = (e as { digest?: string }).digest;
    }
    expect(digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
    expect(getRequestLanguage).toHaveBeenCalledTimes(0);
  });
});

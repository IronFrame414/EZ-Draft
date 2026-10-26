// EZD-171 T12 (vault/plans/EZD-171.md section 4). Pattern app/src/app/dev/errors/page.test.tsx.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createSessionClient = vi.fn();
vi.mock('../../../server/auth/supabase-server', () => ({
  createSessionClient: (...a: unknown[]) => createSessionClient(...a),
}));

import Page from './page';

const getClaims = vi.fn();
const rpc = vi.fn();

describe('EZD-171 cloud check page', () => {
  beforeEach(() => {
    getClaims.mockReset();
    rpc.mockReset();
    createSessionClient.mockReset();
    createSessionClient.mockReturnValue({ auth: { getClaims }, rpc });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('EZD-171 T12 (a) production without sub is not found', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    getClaims.mockResolvedValue({ data: { claims: null }, error: null });
    let digest: string | undefined;
    try {
      await Page();
    } catch (e) {
      digest = (e as { digest?: string }).digest;
    }
    expect(digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('EZD-171 T12 (b) production with sub renders the probe', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    getClaims.mockResolvedValue({ data: { claims: { sub: 'u' } }, error: null });
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain('data-testid="cloud-check-result"');
    expect(html).toContain('data-state="loading"');
  });

  it('EZD-171 T12 (c) outside production no claims are read', async () => {
    vi.stubEnv('VERCEL_ENV', '');
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain('data-testid="cloud-check-result"');
    expect(html).toContain('data-state="loading"');
    expect(createSessionClient).not.toHaveBeenCalled();
  });
});

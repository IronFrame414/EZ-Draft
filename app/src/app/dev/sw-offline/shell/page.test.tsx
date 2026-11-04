// EZD-164 U1, U2 (vault/plans/EZD-164.md section 4): the offline worker probe page.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Page from './page';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('EZD-164 sw-offline shell page', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('EZD-164 U1 page markup', () => {
    vi.stubEnv('VERCEL_ENV', '');
    delete process.env.VERCEL_ENV;
    const ids: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      const html = renderToStaticMarkup(Page());
      expect(html).toContain('data-testid="sw-offline-page"');
      expect(html).toContain('data-testid="sw-offline-probe"');
      expect(html).toContain('data-sw-state="idle"');
      expect(html).toContain('data-sw-hydrated="no"');
      const m = /data-render-id="([^"]*)"/.exec(html);
      expect(m).not.toBeNull();
      expect(m![1]).toMatch(UUID_V4);
      ids.push(m![1]);
    }
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('EZD-164 U2 page in production', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    let digest: string | undefined;
    try {
      Page();
    } catch (e) {
      digest = (e as { digest?: string }).digest;
    }
    expect(digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
  });
});

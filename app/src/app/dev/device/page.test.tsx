// EZD-014c U10 (a), (b) (vault/plans/EZD-014c.md section 4).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Page from './page';

describe('EZD-014c device test page', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('EZD-014c U10 not found in production', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    let digest: string | undefined;
    try {
      await Page({ searchParams: Promise.resolve({}) });
    } catch (e) {
      digest = (e as { digest?: string }).digest;
    }
    expect(digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
  });

  it('EZD-014c U10 full shell markup outside production', async () => {
    vi.stubEnv('VERCEL_ENV', '');
    delete process.env.VERCEL_ENV;
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ lang: 'es' }) }),
    );
    expect(html.match(/data-shell-region="frame"/g)).toHaveLength(1);
    expect(html).not.toContain('data-phone-region');
    expect(html.match(/<header/g)).toHaveLength(1);
    expect(html.match(/data-rail-tool=/g)).toHaveLength(3);
    expect(html.match(/data-header-button-icon/g)).toHaveLength(2);
    expect(html).toContain('/icons/sprite.svg#share');
    expect(html).toContain('/icons/sprite.svg#download');
  });
});

// EZD-209 P1, P2 (vault/plans/EZD-209.md section 4); pattern of dev/states/page.test.tsx.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Page from './page';

describe('EZD-209 typed bar test page', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('EZD-209 P1 not found in production', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    let digest: string | undefined;
    try {
      await Page({ searchParams: Promise.resolve({}) });
    } catch (e) {
      digest = (e as { digest?: string }).digest;
    }
    expect(digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
  });

  it('EZD-209 P2 edit switch', async () => {
    vi.stubEnv('VERCEL_ENV', '');
    delete process.env.VERCEL_ENV;
    const on = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    const off = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ edit: '0' }) }),
    );
    expect(on).toContain('data-testid="typed-bar"');
    expect(off).not.toContain('data-testid="typed-bar"');
  });
});

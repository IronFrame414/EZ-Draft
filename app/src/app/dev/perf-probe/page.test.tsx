// EZD-017 T14 (vault/plans/EZD-017.md section 4; Step 10): the perf probe page. Pattern
// app/src/app/dev/device/page.test.tsx (EZD-014c U10).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Page from './page';

describe('EZD-017 perf probe page', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('EZD-017 T14 (a) full shell and no probe without inject', async () => {
    vi.stubEnv('VERCEL_ENV', '');
    delete process.env.VERCEL_ENV;
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('data-shell-region="frame"');
    expect(html).not.toContain('data-perf-probe-count');
  });

  it('EZD-017 T14 (b) inject=pan-commit mounts the probe', async () => {
    vi.stubEnv('VERCEL_ENV', '');
    delete process.env.VERCEL_ENV;
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ inject: 'pan-commit' }) }),
    );
    expect(html).toContain('data-shell-region="frame"');
    expect(html).toContain('data-perf-probe-count');
  });

  it('EZD-017 T14 (c) not found in production', async () => {
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

// EZD-207c V1-V3 (vault/plans/EZD-207c.md section 4; AC-EZD-207-5): the benchmark plan page. Copy of the
// perf-probe page test (EZD-017 T14). BenchmarkPlan is stubbed: the page test checks the server markup only.
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('./BenchmarkPlan', () => ({
  BenchmarkPlan: () => createElement('div', { 'data-testid': 'benchmark-plan-stub' }),
}));

import Page from './page';

describe('EZD-207c benchmark plan page', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('EZD-207c V1 page renders the wait marker and the plan, no probe', async () => {
    vi.stubEnv('VERCEL_ENV', '');
    delete process.env.VERCEL_ENV;
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('data-perf-wait-plan=""');
    expect(html).toContain('data-testid="benchmark-plan-stub"');
    expect(html).not.toContain('data-perf-probe-count');
  });

  it('EZD-207c V2 inject=pan-commit mounts the probe', async () => {
    vi.stubEnv('VERCEL_ENV', '');
    delete process.env.VERCEL_ENV;
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ inject: 'pan-commit' }) }),
    );
    expect(html).toContain('data-perf-probe-count');
    expect(html).toContain('data-testid="benchmark-plan-stub"');
  });

  it('EZD-207c V3 not found in production', async () => {
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

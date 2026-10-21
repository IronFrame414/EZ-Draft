// EZD-011c H10 (vault/plans/EZD-011c.md section 4). Expected values: plan section 3 and the EZD-010c contract.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Page from './page';

describe('EZD-011c header test page', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('EZD-011c H10 (a) not found in production', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    let caught: unknown;
    try {
      Page();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect((caught as { digest?: string }).digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
  });

  it('EZD-011c H10 (b) renders outside production', () => {
    vi.stubEnv('VERCEL_ENV', '');
    delete process.env.VERCEL_ENV;
    const html = renderToStaticMarkup(<Page />);
    expect(html.match(/<header/g)).toHaveLength(1);
    expect(html).toContain('data-testid="header-demo"');
    expect(html).toContain('data-project-menu-count="0"');
    expect(html).toContain('Sample project');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*aria-current="page"[^>]*>\s*Plan\s*<\/button>/);
  });
});

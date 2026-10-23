// EZD-020 U2-U5 (vault/plans/EZD-020.md section 4; Steps 1, 3, 5): entry group layouts, placeholder pages,
// source maps config and the lazy dev page. Production not-found is matched as in EZD-010 and EZD-012c.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import OfficeLayout from './(office)/layout';
import EditorLayout from './(editor)/layout';
import FieldLayout from './(field)/layout';
import ClientLayout from './(client)/layout';
import OfficePage from './(office)/dev/entry/office/page';
import EditorPage from './(editor)/dev/entry/editor/page';
import FieldPage from './(field)/dev/entry/field/page';
import ClientPage from './(client)/dev/entry/client/page';
import LazyPage from './dev/lazy/page';

const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';

async function notFoundDigest(fn: () => unknown): Promise<string | undefined> {
  try {
    await fn();
  } catch (e) {
    return (e as { digest?: string }).digest;
  }
  return undefined;
}

const unsetVercelEnv = () => {
  vi.stubEnv('VERCEL_ENV', '');
  delete process.env.VERCEL_ENV;
};

describe('EZD-020 entry groups', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('EZD-020 U2 group layouts', async () => {
    const layouts: [string, (p: { children: React.ReactNode }) => unknown][] = [
      ['office', OfficeLayout],
      ['editor', EditorLayout],
      ['field', FieldLayout],
      ['client', ClientLayout],
    ];
    for (const [name, Layout] of layouts) {
      const html = renderToStaticMarkup(
        (await Layout({ children: <i data-c="" /> })) as React.ReactElement,
      );
      expect(html.split(`data-entry="${name}"`).length - 1, name).toBe(1);
      expect(html, name).toContain('data-c');
    }
  });

  it('EZD-020 U3 placeholder pages', async () => {
    unsetVercelEnv();
    const render = async (P: () => unknown) =>
      renderToStaticMarkup((await P()) as React.ReactElement);

    const office = await render(OfficePage);
    expect(office).not.toContain('data-shell-region');
    expect(office).not.toContain('data-phone-region');

    const editor = await render(EditorPage);
    expect(editor).toContain('data-shell-region="frame"');

    for (const P of [FieldPage, ClientPage]) {
      const html = await render(P);
      expect(html).toContain('data-phone-region="frame"');
      expect(html).not.toContain('data-shell-region');
    }

    vi.stubEnv('VERCEL_ENV', 'production');
    for (const P of [OfficePage, EditorPage, FieldPage, ClientPage]) {
      expect(await notFoundDigest(() => P())).toBe(NOT_FOUND);
    }
  });

  it('EZD-020 U4 source maps are off on Vercel', async () => {
    vi.stubEnv('VERCEL', '');
    delete process.env.VERCEL;
    vi.resetModules();
    const off = (await import('../../next.config')).default;
    expect(off.productionBrowserSourceMaps).toBe(true);
    expect(off.outputFileTracingRoot).toBeTruthy();

    vi.stubEnv('VERCEL', '1');
    vi.resetModules();
    const on = (await import('../../next.config')).default;
    expect(on.productionBrowserSourceMaps).toBe(false);
    expect(on.outputFileTracingRoot).toBeTruthy();
  });

  it('EZD-020 U5 lazy dev page', async () => {
    unsetVercelEnv();
    const html = renderToStaticMarkup((await LazyPage()) as React.ReactElement);
    expect(html).toContain('data-testid="lazy-load"');
    expect(html).not.toContain('ezd-lazy-sample-7f3a');

    vi.stubEnv('VERCEL_ENV', 'production');
    expect(await notFoundDigest(() => LazyPage())).toBe(NOT_FOUND);
  });
});

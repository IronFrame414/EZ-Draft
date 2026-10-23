// EZD-013 U3 (vault/plans/EZD-013.md section 4).
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import RootLayout, { metadata, viewport } from './layout';

vi.mock('next/font/local', () => ({
  default: (opts: { variable: string }) => ({
    className: 'c',
    variable: opts.variable === '--ez-font-sans' ? 'v-sans' : 'v-mono',
    style: {},
  }),
}));

describe('EZD-013 root layout install metadata', () => {
  it('U3: title, appleWebApp, theme colour; the markup gains nothing visible', () => {
    expect(metadata.title).toBe('EZ Draft');
    expect(metadata.appleWebApp).toEqual({
      capable: true,
      title: 'EZ Draft',
      statusBarStyle: 'default',
    });
    expect(viewport.themeColor).toBe('#f6f7f9');
    const html = renderToStaticMarkup(RootLayout({ children: <p /> }));
    expect(html).toMatch(/<body[^>]*><p><\/p><\/body>/);
  });
});

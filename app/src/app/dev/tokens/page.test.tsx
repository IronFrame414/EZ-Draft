// EZD-010c T3, T4 (vault/plans/EZD-010c.md section 4). Expected values: 04 Frame and visual system lines 7-11.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Page from './page';

const SPEC: [string, string][] = [
  ['--ez-cobalt', 'oklch(0.55 0.17 262)'],
  ['--ez-cobalt-text', 'oklch(0.45 0.17 262)'],
  ['--ez-cobalt-tint', '#eef1ff'],
  ['--ez-ink', '#14171c'],
  ['--ez-slate-700', '#3b424d'],
  ['--ez-slate-500', '#5e6672'],
  ['--ez-slate-400', '#7a828e'],
  ['--ez-slate-300', '#9aa3af'],
  ['--ez-border', '#dfe2e6'],
  ['--ez-divider', '#eef0f3'],
  ['--ez-hover', '#f2f4f7'],
  ['--ez-canvas', '#f6f7f9'],
  ['--ez-canvas-grid', '#e6e9ed'],
  ['--ez-surface', '#fff'],
  ['--ez-red', 'oklch(0.6 0.19 28)'],
  ['--ez-amber', 'oklch(0.72 0.16 65)'],
  ['--ez-amber-tint', 'oklch(0.96 0.04 80)'],
  ['--ez-green', 'oklch(0.42 0.12 150)'],
  ['--ez-green-tint', 'oklch(0.95 0.05 150)'],
  ['--ez-radius-5', '5px'],
  ['--ez-radius-7', '7px'],
  ['--ez-radius-8', '8px'],
  ['--ez-radius-10', '10px'],
  ['--ez-radius-12', '12px'],
  ['--ez-radius-999', '999px'],
  ['--ez-shadow-card', '0 1px 2px rgba(20,30,50,.05), 0 8px 24px rgba(20,30,50,.07)'],
  ['--ez-shadow-floating', '0 6px 20px rgba(20,30,50,.08)'],
  ['--ez-header-height', '60px'],
  ['--ez-header-margin', '16px'],
  ['--ez-body-padding', '16px'],
  ['--ez-body-gap', '16px'],
  ['--ez-rail-width', '56px'],
  ['--ez-left-panel-width', '248px'],
  ['--ez-inspector-width', '336px'],
  ['--ez-status-bar-height', '30px'],
  ['--ez-grid-size', '32px'],
];

const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const htmlEsc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

describe('EZD-010c token test page', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('EZD-010c done when: token test page matches every spec value', () => {
    vi.stubEnv('VERCEL_ENV', '');
    delete process.env.VERCEL_ENV;
    const html = renderToStaticMarkup(<Page />);

    // (a) and (b): one element per spec row, value shown, sample uses the variable.
    expect(SPEC).toHaveLength(36);
    for (const [name, value] of SPEC) {
      const re = new RegExp(
        `<[^>]*data-token="${reEsc(name)}"[^>]*data-value="${reEsc(htmlEsc(value))}"`,
      );
      expect(html, `data-token ${name}`).toMatch(re);
      expect(html, `style var(${name})`).toMatch(new RegExp(`style="[^"]*var\\(${reEsc(name)}\\)`));
    }

    // (c) five type specimens.
    expect(html.match(/data-font=/g)?.length).toBe(5);
    const tags = html.match(/<[^>]*data-font="[^"]*"[^>]*>/g) ?? [];
    expect(tags).toHaveLength(5);
    const pairs = tags.map((t) => {
      const font = /data-font="([^"]*)"/.exec(t)?.[1];
      const weight = /data-weight="([^"]*)"/.exec(t)?.[1];
      const style = /style="([^"]*)"/.exec(t)?.[1] ?? '';
      if (font === 'sans') expect(style).toContain('var(--ez-font-sans)');
      if (font === 'mono') expect(style).toContain('var(--ez-font-mono)');
      return `${font}/${weight}`;
    });
    expect([...pairs].sort()).toEqual(
      ['mono/400', 'mono/500', 'sans/400', 'sans/500', 'sans/600'].sort(),
    );

    // (d) first icon.
    expect(html).toMatch(
      /data-icon="expand_more"[\s\S]{0,400}?<use href="\/icons\/sprite\.svg#expand_more"/,
    );
  });

  it('EZD-010c T4 (a): the page is not found when VERCEL_ENV is production', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    let thrown: unknown;
    try {
      Page();
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();
    expect((thrown as { digest?: string }).digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
  });

  it('EZD-010c T4 (b): the page renders on a preview', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    const html = renderToStaticMarkup(<Page />);
    expect(html).toContain('data-token="--ez-cobalt"');
  });
});

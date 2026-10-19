// EZD-010c T6 (vault/plans/EZD-010c.md section 4).
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import RootLayout, { metadata } from './layout';

vi.mock('next/font/local', () => ({
  default: (opts: { variable: string }) => ({
    className: 'c',
    variable: opts.variable === '--ez-font-sans' ? 'v-sans' : 'v-mono',
    style: {},
  }),
}));

const here = path.dirname(fileURLToPath(import.meta.url));

describe('EZD-010c root layout wires tokens and fonts', () => {
  it('T6 (a): html lang and font variable classes, body holds children', () => {
    const html = renderToStaticMarkup(RootLayout({ children: <p /> }));
    const tag = /<html[^>]*>/.exec(html)?.[0] ?? '';
    expect(tag).toMatch(/lang="en"/);
    const cls = /class="([^"]*)"/.exec(tag)?.[1].split(/\s+/) ?? [];
    expect(cls).toContain('v-sans');
    expect(cls).toContain('v-mono');
    expect(html).toMatch(/<body[^>]*>[\s\S]*<p><\/p>/);
  });

  it('T6 (b): title', () => {
    expect(metadata.title).toBe('EZ Draft');
  });

  it('T6 (c): tokens.css before globals.css; fonts from ../styles/fonts', () => {
    const src = readFileSync(path.join(here, 'layout.tsx'), 'utf8');
    const t = src.search(/import\s+['"]\.\.\/styles\/tokens\.css['"]/);
    const g = src.search(/import\s+['"]\.\.\/styles\/globals\.css['"]/);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(g).toBeGreaterThan(t);
    expect(src).toMatch(/from\s+['"]\.\.\/styles\/fonts['"]/);
  });

  it('T6 (d): globals.css sets the body font to the sans variable', () => {
    const css = readFileSync(path.join(here, '..', 'styles', 'globals.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ');
    expect(css).toMatch(/(?:^|\})\s*body\s*\{[^}]*font-family:\s*var\(--ez-font-sans\)/);
  });
});

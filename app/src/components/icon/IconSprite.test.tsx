// EZD-347 U1-U5 (vault/plans/EZD-347.md section 4; AC-EZD-347-1). Walk pattern: components/states/states-imports.test.ts.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Icon, ICON_ID_PREFIX } from './Icon';
import { IconSprite } from './IconSprite';
import { ICON_NAMES } from './icon-names.generated';
import RootLayout from '../../app/layout';

vi.mock('next/font/local', () => ({
  default: (opts: { variable: string }) => ({
    className: 'c',
    variable: opts.variable === '--ez-font-sans' ? 'v-sans' : 'v-mono',
    style: {},
  }),
}));

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '..', '..');

function walk(dir: string): Array<string> {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

const sprite = () => renderToStaticMarkup(<IconSprite />);
const ids = (html: string) => [...html.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]);

describe('EZD-347 inline icon sprite', () => {
  it('EZD-347 U1: IconSprite renders one symbol per icon name with the generated paths', () => {
    const html = sprite();
    expect(
      html.startsWith(
        '<svg display="none" aria-hidden="true" focusable="false" data-testid="icon-sprite">',
      ),
    ).toBe(true);
    expect(ids(html)).toEqual(ICON_NAMES.map((n) => 'ez-icon-' + n));
    const symbols = html.match(/<symbol\b[^>]*>/g) ?? [];
    expect(symbols.length).toBe(ICON_NAMES.length);
    for (const s of symbols) expect(s).toContain('viewBox="0 -960 960 960"');
    const cloud = /<symbol id="ez-icon-cloud_off"[^>]*>([\s\S]*?)<\/symbol>/.exec(html)?.[1] ?? '';
    const got = [...cloud.matchAll(/<path d="([^"]*)"/g)].map((m) => m[1]);
    const file = readFileSync(path.join(here, 'svg', 'cloud_off.svg'), 'utf8');
    const want = [...file.matchAll(/<path\b[^>]*?\sd="([^"]*)"/g)].map((m) => m[1]);
    expect(want.length).toBeGreaterThan(0);
    expect(got).toEqual(want);
    for (const bad of ['<script', '<style', 'href=']) expect(html).not.toContain(bad);
  });

  it('EZD-347 U2: Icon points at the in-page symbol', () => {
    expect(ICON_ID_PREFIX).toBe('ez-icon-');
    expect(renderToStaticMarkup(<Icon name="cloud_off" size={20} />)).toBe(
      '<svg width="20" height="20" aria-hidden="true" focusable="false" fill="currentColor"><use href="#ez-icon-cloud_off"></use></svg>',
    );
  });

  it('EZD-347 U3: every Icon href names a symbol in IconSprite', () => {
    const have = new Set(ids(sprite()));
    expect(have.size).toBe(ICON_NAMES.length);
    for (const n of ICON_NAMES) {
      const html = renderToStaticMarkup(<Icon name={n} size={20} />);
      const href = /<use href="([^"]*)"/.exec(html)?.[1] ?? '';
      expect(href.startsWith('#'), n).toBe(true);
      expect(have.has(href.slice(1)), n).toBe(true);
    }
  });

  it('EZD-347 U4: the icon data reaches only the root layout', () => {
    const files = walk(src).map((f) => ({
      rel: path.relative(src, f).split(path.sep).join('/'),
      text: readFileSync(f, 'utf8'),
    }));
    expect(
      files.filter((f) => f.text.includes("icon-symbols.generated'")).map((f) => f.rel),
    ).toEqual(['components/icon/IconSprite.tsx']);
    expect(files.filter((f) => f.text.includes("/IconSprite'")).map((f) => f.rel)).toEqual([
      'app/layout.tsx',
    ]);
    for (const rel of [
      'components/icon/IconSprite.tsx',
      'components/icon/icon-symbols.generated.ts',
    ]) {
      const f = files.find((x) => x.rel === rel);
      expect(f, rel).toBeTruthy();
      expect(f?.text.trimStart().startsWith("'use client'"), rel).toBe(false);
    }
  });

  it('EZD-347 U5: the root layout renders the sprite first in body', () => {
    const html = renderToStaticMarkup(RootLayout({ children: <p /> }));
    expect(html).toMatch(
      /<body[^>]*><svg display="none" aria-hidden="true" focusable="false" data-testid="icon-sprite">[\s\S]*?<\/svg><p><\/p><\/body>/,
    );
  });
});

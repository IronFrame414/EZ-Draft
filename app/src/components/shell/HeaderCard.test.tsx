// EZD-011a · H16: HeaderCard markup, server-safe source and the shell barrel (vault/plans/EZD-011a.md Section 4).
// Sources: Section 3 contract; P11 Step 2 (renders one <header>, no 'use client'); EZD-012 plan lines 114, 161, 173.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import styles from './HeaderCard.module.css';
import { HeaderCard } from './HeaderCard';
import { HeaderButton } from './HeaderButton';
import * as shell from './index';

const here = path.dirname(fileURLToPath(import.meta.url));

// The space-separated tokens of the first class attribute in the markup.
function classTokens(html: string): string[] {
  const m = /class="([^"]*)"/.exec(html);
  return m ? m[1].split(' ').filter((c) => c.length > 0) : [];
}

describe('EZD-011a HeaderCard', () => {
  it('H16 (1): with aria-label and a child, the root is one <header> with the header class and the child inside', () => {
    const html = renderToStaticMarkup(
      <HeaderCard aria-label="T">
        <span data-c="1" />
      </HeaderCard>,
    );
    expect(html.startsWith('<header')).toBe(true);
    expect(html.endsWith('</header>')).toBe(true);
    expect(html.split('<header').length - 1).toBe(1);
    expect(classTokens(html)).toEqual([styles.header]);
    expect(html).toContain('aria-label="T"');
    expect(html).toContain('<span data-c="1"></span>');
  });

  it('H16 (2): with no props, the markup is an empty <header> with the header class and no aria-label', () => {
    expect(renderToStaticMarkup(<HeaderCard />)).toBe(`<header class="${styles.header}"></header>`);
  });

  it('H16 (3): HeaderCard.tsx has no use client directive', () => {
    const source = readFileSync(path.join(here, 'HeaderCard.tsx'), 'utf8');
    expect(source).not.toMatch(/['"]use client['"]/);
  });

  it('H16 (4): the shell barrel re-exports HeaderCard and HeaderButton by name', () => {
    expect(shell.HeaderCard).toBe(HeaderCard);
    expect(shell.HeaderButton).toBe(HeaderButton);
  });
});

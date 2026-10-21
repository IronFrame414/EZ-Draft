// EZD-011a · H8 and the done-when: HeaderButton markup and CSS (vault/plans/EZD-011a.md Section 4).
// Sources: S03 .b, .b:hover, .bp (04 Frame and the header table: secondary and "Issue set (primary)");
// Section 3 class order; Done when ("passes every other prop through").
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import styles from './HeaderButton.module.css';
import { HeaderButton } from './HeaderButton';

const here = path.dirname(fileURLToPath(import.meta.url));

const squash = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Declarations ("name: value") of the rule whose selector is exactly `selector`.
function block(css: string, selector: string): string[] {
  const rules = [...squash(css).matchAll(/([^{}]*)\{([^{}]*)\}/g)];
  const hit = rules.find((r) => squash(r[1]) === selector);
  if (!hit) return [];
  return hit[2]
    .split(';')
    .map((d) => squash(d))
    .filter((d) => d.length > 0);
}

// The space-separated tokens of the first class attribute in the markup.
function classTokens(html: string): string[] {
  const m = /class="([^"]*)"/.exec(html);
  return m ? m[1].split(' ').filter((c) => c.length > 0) : [];
}

describe('EZD-011a HeaderButton', () => {
  it('H8 (1): the default renders one type="button" with the button class only', () => {
    const html = renderToStaticMarkup(<HeaderButton>Share</HeaderButton>);
    expect(html.split('<button').length - 1).toBe(1);
    expect(html).toContain('type="button"');
    expect(classTokens(html)).toEqual([styles.button]);
    expect(html).toContain('>Share</button>');
  });

  it('H8 (2): variant primary adds the primary class after button, caller className last, other props pass through', () => {
    const html = renderToStaticMarkup(
      <HeaderButton variant="primary" aria-haspopup="menu" data-x="1" title="t" className="extra">
        Issue set
      </HeaderButton>,
    );
    expect(html.split('<button').length - 1).toBe(1);
    expect(html).toContain('type="button"');
    expect(classTokens(html)).toEqual([styles.button, styles.primary, 'extra']);
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('data-x="1"');
    expect(html).toContain('title="t"');
    expect(html).toContain('>Issue set</button>');
  });

  it('H8 (3): a caller type wins over the default button type', () => {
    const html = renderToStaticMarkup(<HeaderButton type="submit">S</HeaderButton>);
    expect(html).toContain('type="submit"');
    expect(html).not.toContain('type="button"');
  });

  it('H8 (4): .button, .button:hover and .primary carry the board declarations', () => {
    const css = readFileSync(path.join(here, 'HeaderButton.module.css'), 'utf8');

    const button = block(css, '.button');
    expect(button).toContain('border: 1px solid var(--ez-border)');
    expect(button).toContain('border-radius: var(--ez-radius-8)');
    expect(button).toContain('background: var(--ez-surface)');
    expect(button).toContain('color: var(--ez-ink)');
    expect(button).toContain('padding: 9px 14px');

    expect(block(css, '.button:hover')).toContain('border-color: var(--ez-border-hover)');

    const primary = block(css, '.primary');
    expect(primary).toContain('background: var(--ez-cobalt)');
    expect(primary).toContain('border-color: var(--ez-cobalt)');
    expect(primary).toContain('color: var(--ez-surface)');
    expect(primary).toContain('font-weight: 600');
    expect(primary).toContain('padding: 9px 16px');
  });
});

describe('EZD-011a done when', () => {
  it('EZD-011a done when: HeaderButton renders secondary and primary buttons and passes every other prop through', () => {
    const secondary = renderToStaticMarkup(
      <HeaderButton aria-label="Share" data-x="1">
        Share
      </HeaderButton>,
    );
    expect(classTokens(secondary)).toEqual([styles.button]);
    expect(secondary).toContain('aria-label="Share"');
    expect(secondary).toContain('data-x="1"');

    const primary = renderToStaticMarkup(
      <HeaderButton variant="primary" aria-label="Issue set" data-x="2">
        Issue set
      </HeaderButton>,
    );
    expect(classTokens(primary)).toEqual([styles.button, styles.primary]);
    expect(primary).toContain('aria-label="Issue set"');
    expect(primary).toContain('data-x="2"');
  });
});

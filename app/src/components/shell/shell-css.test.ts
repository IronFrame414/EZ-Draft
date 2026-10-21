// EZD-011a · H7 part a, H11 and the done-when: shell CSS, body reset and the --ez-border-hover token.
// Sources: vault/plans/EZD-011a.md Section 3 (card.module.css has exactly four declarations) and Section 4;
// 04 Frame (60 px header card, margin 16, card surface, radius 12, card shadow); S03 .b / .b:hover; Q-0238.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TOKENS } from '../../styles/tokens';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.join(here, rel), 'utf8');

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

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\(|oklch\(/;

describe('EZD-011a shell CSS', () => {
  it('H7 part a (a): .header composes the card, is border-box at var(--ez-header-height) with var(--ez-header-margin) top and sides, flex none', () => {
    const decls = block(read('HeaderCard.module.css'), '.header');
    expect(decls[0]).toBe("composes: card from './card.module.css'");
    expect(decls).toContain('box-sizing: border-box');
    expect(decls).toContain('height: var(--ez-header-height)');
    expect(decls).toContain('margin: var(--ez-header-margin) var(--ez-header-margin) 0');
    expect(decls).toContain('flex: none');
  });

  it('H7 part a (b): .card is exactly the four shared card-surface declarations', () => {
    expect(block(read('card.module.css'), '.card')).toEqual([
      'background: var(--ez-surface)',
      'border: 1px solid var(--ez-border)',
      'border-radius: var(--ez-radius-12)',
      'box-shadow: var(--ez-shadow-card)',
    ]);
  });

  it('H7 part a (c): the three shell CSS files hold no hex, rgb(), rgba() or oklch() literal', () => {
    for (const file of ['card.module.css', 'HeaderCard.module.css', 'HeaderButton.module.css']) {
      expect(squash(read(file)), file).not.toMatch(COLOR_LITERAL);
    }
  });

  it('H7 part a (d): the body rule has margin 0 and keeps font-family var(--ez-font-sans)', () => {
    const decls = block(read('../../styles/globals.css'), 'body');
    expect(decls).toContain('margin: 0');
    expect(decls).toContain('font-family: var(--ez-font-sans)');
  });
});

describe('EZD-011a border-hover token', () => {
  it('H11 (AC-EZD-011a-3): tokens.css declares --ez-border-hover: #c9ced5 once in :root, and TOKENS has exactly that entry', () => {
    const rootDecls = block(read('../../styles/tokens.css'), ':root').filter((d) =>
      d.startsWith('--ez-border-hover:'),
    );
    expect(rootDecls).toEqual(['--ez-border-hover: #c9ced5']);

    const hits = TOKENS.filter((t) => t.name === '--ez-border-hover');
    expect(hits).toEqual([{ name: '--ez-border-hover', value: '#c9ced5', group: 'color' }]);
  });
});

describe('EZD-011a done when', () => {
  it('EZD-011a done when: the header is the 60 px border-box card on the shared card surface, and --ez-border-hover is in both token files', () => {
    const header = block(read('HeaderCard.module.css'), '.header');
    expect(header[0]).toBe("composes: card from './card.module.css'");
    expect(header).toContain('box-sizing: border-box');
    expect(header).toContain('height: var(--ez-header-height)');
    expect(header).toContain('margin: var(--ez-header-margin) var(--ez-header-margin) 0');

    const card = block(read('card.module.css'), '.card');
    expect(card).toContain('background: var(--ez-surface)');
    expect(card).toContain('box-shadow: var(--ez-shadow-card)');

    const rootDecls = block(read('../../styles/tokens.css'), ':root');
    expect(rootDecls).toContain('--ez-border-hover: #c9ced5');
    expect(TOKENS.some((t) => t.name === '--ez-border-hover' && t.value === '#c9ced5')).toBe(true);
  });
});

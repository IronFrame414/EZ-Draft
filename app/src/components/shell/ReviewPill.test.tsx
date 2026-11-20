// EZD-127 P1-P2 (AC-EZD-127-1; 04 Header card "N to review" pill (amber), "Hidden when N = 0"; mockups S14 and
// S20 "2 to review"; Q-0037 (b) text --ez-amber-text, dot --ez-amber). Renders in the real office catalog.
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { ReviewPill } from './ReviewPill';

const render = (count: number, open = false) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      <ReviewPill count={count} open={open} onToggle={() => {}} listId="rl1" />
    </MessagesProvider>,
  );

describe('EZD-127 ReviewPill', () => {
  it('P1 shows "N to review" for N > 0 and is hidden at 0', () => {
    for (const [n, text] of [
      [1, '1 to review'],
      [2, '2 to review'],
      [12, '12 to review'],
    ] as const) {
      const pills = elements(render(n), 'review-pill');
      expect(pills).toHaveLength(1);
      expect(textOf(pills[0].inner)).toBe(text);
      expect(attr(pills[0].attrs, 'data-count')).toBe(String(n));
      expect(attr(pills[0].attrs, 'aria-expanded')).toBe('false');
      expect(attr(pills[0].attrs, 'aria-haspopup')).toBe('dialog');
    }
    expect(elements(render(0), 'review-pill')).toHaveLength(0);
    expect(render(0)).not.toContain('to review');
    const open = elements(render(3, true), 'review-pill')[0];
    expect(attr(open.attrs, 'aria-expanded')).toBe('true');
    expect(attr(open.attrs, 'aria-controls')).toBe('rl1');
  });

  it('P2 the pill text is the darker amber and the dot the spec amber, on the amber tint', () => {
    const css = readFileSync(new URL('./ReviewPill.module.css', import.meta.url), 'utf8');
    const block = (name: string) => css.match(new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    expect(block('pill')).toMatch(/color:\s*var\(--ez-amber-text\)/);
    expect(block('pill')).toMatch(/background:\s*var\(--ez-amber-tint\)/);
    expect(block('pill')).toMatch(/border-radius:\s*var\(--ez-radius-999\)/);
    expect(block('dot')).toMatch(/background:\s*var\(--ez-amber\)/);
    const tokens = readFileSync(new URL('../../styles/tokens.css', import.meta.url), 'utf8');
    expect(tokens).toContain('--ez-amber: oklch(0.72 0.16 65);');
    expect(tokens).toContain('--ez-amber-tint: oklch(0.96 0.04 80);');
    expect(tokens).toContain('--ez-amber-text: oklch(0.48 0.13 65);');
  });
});

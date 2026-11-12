// EZD-213c M1 replaces EZD-210b G1, G2 (vault/plans/EZD-213c.md section 4; D-Marker; Q-0569 (c); Q-0570; L-060).
// Their panel checks moved to inspector/ResolveGap.test.tsx S1, S2. Markup through renderToStaticMarkup (L-020: the
// wrapper is MessagesProvider; no ^/$ anchors on the wrapper tags).
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import touch from '../../styles/touch.module.css';
import { GapBoxes } from './GapBoxes';
import type { GapBox } from './gap';
import { uid } from './test-utils/fixtures';

const fn = () => {};

function render(ui: ReactElement): string {
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  );
}

const count = (s: string, needle: string) => s.split(needle).length - 1;
const decode = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
const textOf = (html: string, testId: string): string | null => {
  const m = html.match(new RegExp(`<(\\w+)[^>]*data-testid="${testId}"[^>]*>([\\s\\S]*?)</\\1>`));
  return m ? decode(m[2]!.replace(/<[^>]*>/g, '')) : null;
};
const buttonFor = (html: string, testId: string): string => {
  const m = html.match(
    new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>[\\s\\S]*?</button>`),
  );
  return m ? m[0] : '';
};

const BOX: GapBox = {
  wallIds: [uid(1), uid(2), uid(3), uid(4)],
  at: { x: 0, y: 0.25 },
  gap: { x: 0, y: -0.5 },
  sizeIn: 0.5,
  displayIn: 0.5,
  sizeText: '1/2"',
  actions: ['absorb', 'keep'],
  note: null,
};

describe('EZD-213c gap marker', () => {
  it('EZD-213c M1 the plan keeps only the red size marker', () => {
    const html = render(<GapBoxes boxes={[BOX]} onShow={fn} boxRef={fn} />);
    expect(count(html, 'data-testid="gap-box"')).toBe(1);
    expect(html).toContain(`data-gap-walls="${BOX.wallIds.join(',')}"`);
    expect(html).not.toContain('data-pick');
    expect(count(html, '<button')).toBe(1);
    const pill = buttonFor(html, 'gap-pill');
    expect(pill).toContain('type="button"');
    expect(textOf(html, 'gap-pill')).toBe('1/2" gap');
    expect(pill).toContain(touch.hitArea);
    for (const t of ['gap-title', 'gap-pick', 'gap-keep', 'gap-hint', 'gap-alert', 'gap-note']) {
      expect(count(html, `data-testid="${t}"`), t).toBe(0);
    }
    expect(count(html, 'role="alert"')).toBe(0);
  });
});

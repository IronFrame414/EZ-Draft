// EZD-213c S1, S2 (vault/plans/EZD-213c.md section 4; D-Markup; en.ts:497-510; S02 HTML :97-100; Q-0570; Q-0633 G9).
// Markup through renderToStaticMarkup (L-020: the wrapper is MessagesProvider). BOX is copied from GapBoxes.test.tsx.
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import type { GapBox } from '../tools/gap';
import { uid } from '../tools/test-utils/fixtures';
import { ResolveGap, type ResolveGapProps } from './ResolveGap';

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
const htmlOf = (html: string, testId: string): string => {
  const m = html.match(new RegExp(`<(\\w+)[^>]*data-testid="${testId}"[^>]*>([\\s\\S]*?)</\\1>`));
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

const ACROSS = 'That wall runs across the gap. Pick a wall that runs the same way as the gap.';

const show = (over: Partial<ResolveGapProps> = {}) =>
  render(
    <ResolveGap
      box={BOX}
      picking={false}
      alert={null}
      coarse={false}
      onPick={fn}
      onKeep={fn}
      {...over}
    />,
  );

describe('EZD-213c Resolve the gap section', () => {
  it('EZD-213c S1 the section: title, size, two buttons', () => {
    const html = show();
    expect(html).toContain('data-testid="inspector-gap"');
    expect(html).toContain('data-pick="false"');
    expect(textOf(html, 'gap-title')).toBe('Resolve the gap');
    expect(textOf(html, 'gap-size')).toBe('1/2" gap');
    expect(htmlOf(html, 'gap-size')).toContain('#ez-icon-error');
    expect(textOf(html, 'gap-pick')).toContain('Pick the wall that absorbs it');
    expect(htmlOf(html, 'gap-pick')).toContain('#ez-icon-ads_click');
    expect(textOf(html, 'gap-keep')).toContain('Keep the room out of square');
    expect(htmlOf(html, 'gap-keep')).toContain('#ez-icon-rotate_right');
    const at = (t: string) => html.indexOf(`data-testid="${t}"`);
    expect(at('gap-title')).toBeLessThan(at('gap-size'));
    expect(at('gap-size')).toBeLessThan(at('gap-pick'));
    expect(at('gap-pick')).toBeLessThan(at('gap-keep'));
    expect(count(html, '<button')).toBe(2);
    expect(count(html, 'data-testid="gap-note"')).toBe(0);
    expect(count(html, 'data-testid="gap-hint"')).toBe(0);
    expect(count(html, 'role="alert"')).toBe(0);
  });

  it('EZD-213c S2 keep only, picking, refusal, tablet hint, view-only', () => {
    const keepOnly = show({ box: { ...BOX, actions: ['keep'], note: 'office.tools.gap.use_move' } });
    expect(count(keepOnly, '<button')).toBe(1);
    expect(count(keepOnly, 'data-testid="gap-keep"')).toBe(1);
    expect(count(keepOnly, 'data-testid="gap-pick"')).toBe(0);
    expect(textOf(keepOnly, 'gap-note')).toBe(catalogFor('office', 'en')['office.tools.gap.use_move']);

    const picking = show({ picking: true, alert: 'office.tools.gap.across' });
    expect(picking).toContain('data-pick="true"');
    expect(textOf(picking, 'gap-hint')).toBe('Click a wall of this room, or press Esc to go back');
    expect(count(picking, '<button')).toBe(0);
    expect(textOf(picking, 'gap-alert')).toBe(ACROSS);
    expect(picking).toContain('role="alert"');

    const tablet = show({ picking: true, alert: 'office.tools.gap.across', coarse: true });
    expect(textOf(tablet, 'gap-hint')).toBe('Tap a wall of this room, or tap Select to go back');

    const viewOnly = show({
      box: { ...BOX, actions: [] },
      picking: true,
      alert: 'office.tools.gap.across',
    });
    expect(textOf(viewOnly, 'gap-size')).toBe('1/2" gap');
    expect(count(viewOnly, '<button')).toBe(0);
    for (const t of ['gap-title', 'gap-hint', 'gap-alert']) {
      expect(count(viewOnly, `data-testid="${t}"`), t).toBe(0);
    }
  });
});

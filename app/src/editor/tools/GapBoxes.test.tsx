// EZD-210b G1, G2 (vault/plans/EZD-210b.md section 4; Decided "Gap box"; S02B :71, :97-100; Q-0569 (c); Q-0570).
// Markup through renderToStaticMarkup with the render helper copied from ToolRail.test.tsx (L-020: the wrapper
// is MessagesProvider; no ^/$ anchors on the wrapper tags).
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
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

const show = (box: GapBox, pick: { gapWallIds: readonly string[] } | null, key: string | null) =>
  render(
    <GapBoxes
      boxes={[box]}
      pick={pick}
      message={key === null ? null : { wallIds: box.wallIds, key: key as never }}
      onPick={fn}
      onKeep={fn}
      boxRef={fn}
    />,
  );

describe('EZD-210b gap boxes', () => {
  it('G1 a gap box shows the pill, the title and both buttons in order with their icons', () => {
    const html = show(BOX, null, null);
    expect(count(html, 'data-testid="gap-box"')).toBe(1);
    expect(html).toContain('data-pick="false"');
    expect(textOf(html, 'gap-pill')).toBe('1/2" gap');
    expect(textOf(html, 'gap-title')).toBe('Resolve the gap');
    expect(textOf(html, 'gap-pick')).toContain('Pick the wall that absorbs it');
    expect(textOf(html, 'gap-keep')).toContain('Keep the room out of square');
    expect(buttonFor(html, 'gap-pick')).toContain('#ez-icon-ads_click');
    expect(buttonFor(html, 'gap-keep')).toContain('#ez-icon-rotate_right');
    expect(html.indexOf('data-testid="gap-pick"')).toBeLessThan(
      html.indexOf('data-testid="gap-keep"'),
    );
    expect(count(html, '<button')).toBe(2);
    expect(count(html, 'data-testid="gap-note"')).toBe(0);
    expect(count(html, 'data-testid="gap-hint"')).toBe(0);
    expect(count(html, 'role="alert"')).toBe(0);
  });

  it('G2 keep-only shows the note, view-only shows the pill alone, pick mode shows the hint and the refusal', () => {
    const keepOnly = show(
      { ...BOX, actions: ['keep'], note: 'office.tools.gap.use_move' },
      null,
      null,
    );
    expect(count(keepOnly, '<button')).toBe(1);
    expect(count(keepOnly, 'data-testid="gap-keep"')).toBe(1);
    expect(count(keepOnly, 'data-testid="gap-pick"')).toBe(0);
    expect(textOf(keepOnly, 'gap-note')).toBe(
      'This gap runs both ways. Move a wall to close it.',
    );

    const viewOnly = show({ ...BOX, actions: [] }, null, null);
    expect(count(viewOnly, 'data-testid="gap-pill"')).toBe(1);
    expect(count(viewOnly, '<button')).toBe(0);
    expect(count(viewOnly, 'data-testid="gap-title"')).toBe(0);

    const picking = show(BOX, { gapWallIds: BOX.wallIds }, 'office.tools.gap.across');
    expect(picking).toContain('data-pick="true"');
    expect(count(picking, 'data-testid="gap-hint"')).toBe(1);
    expect(count(picking, '<button')).toBe(0);
    expect(textOf(picking, 'gap-alert')).toBe(
      'That wall runs across the gap. Pick a wall that runs the same way as the gap.',
    );
    expect(picking).toContain('role="alert"');
  });
});

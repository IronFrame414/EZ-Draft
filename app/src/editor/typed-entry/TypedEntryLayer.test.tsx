// EZD-209 M1-M3 (vault/plans/EZD-209.md section 4).
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { InlineBox, TypedBar, TypedEntryLayer } from './TypedEntryLayer';
import {
  TURN_ANGLE_FIELD,
  WALL_LENGTH_FIELD,
  type TypedEntryState,
  type TypedTool,
} from './typed-entry';

const STUB: TypedTool = {
  id: 'stub',
  icon: 'straighten',
  fields: [WALL_LENGTH_FIELD, TURN_ANGLE_FIELD],
};
const ONE: TypedTool = { id: 'one', icon: 'straighten', fields: [WALL_LENGTH_FIELD] };
const fn = () => {};
const EMPTY = '<div lang="en" style="display:contents"></div>';

function render(ui: ReactElement): string {
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  );
}
const layer = (tool: TypedTool | null, canEdit: boolean, lastValues: Record<string, number> = {}) =>
  render(
    <TypedEntryLayer
      tool={tool}
      canEdit={canEdit}
      lastValues={lastValues}
      getCursor={() => null}
      onCommit={fn}
    />,
  );
const decode = (s: string) =>
  s
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
const count = (html: string, id: string) => html.split(`data-testid="${id}"`).length - 1;
const tagOf = (html: string, id: string) =>
  html.match(new RegExp(`<[^>]*data-testid="${id}"[^>]*>`))?.[0] ?? '';
const textOf = (html: string, id: string): string => {
  const m = html.match(new RegExp(`<(\\w+)[^>]*data-testid="${id}"[^>]*>(.*?)</\\1>`));
  return m ? decode(m[2]!) : '';
};

describe('EZD-209 typed entry layer markup', () => {
  it('EZD-209 M1 hidden', () => {
    expect(layer(null, true)).toBe(EMPTY);
    expect(layer(STUB, false)).toBe(EMPTY);
  });

  it('EZD-209 M2 bar closed', () => {
    const a = layer(STUB, true);
    expect(textOf(a, 'typed-bar-label')).toBe('Length');
    expect(count(a, 'typed-bar-value')).toBe(0);
    expect(textOf(a, 'typed-bar-hint')).toBe('Type a size');
    expect(textOf(a, 'typed-bar-tab')).toBe('Tab');
    expect(count(a, 'typed-box')).toBe(0);
    expect(textOf(layer(STUB, true, { length: 150 }), 'typed-bar-value')).toBe('12\' 6"');
    expect(textOf(layer(STUB, true, { length: 150.25 }), 'typed-bar-value')).toBe('12\' 6 1/2"');
    expect(count(layer(ONE, true), 'typed-bar-tab')).toBe(0);
  });

  it('EZD-209 M3 open and error state', () => {
    const state: TypedEntryState = {
      open: true,
      active: 1,
      texts: ['120', '180'],
      error: 'office.typed.angle_refused',
      anchor: 'cursor',
    };
    const bar = render(
      <TypedBar tool={STUB} state={state} lastValues={{ length: 150 }} onFieldPress={fn} />,
    );
    expect(textOf(bar, 'typed-bar-label')).toBe('Angle');
    expect(count(bar, 'typed-bar-value')).toBe(0);
    expect(count(bar, 'typed-bar-hint')).toBe(0);
    expect(tagOf(bar, 'typed-bar-error')).toContain('role="alert"');
    expect(textOf(bar, 'typed-bar-error')).toBe('Use a turn from 0 up to but not including 180');
    const box = render(<InlineBox tool={STUB} state={state} onEdit={fn} onKeyDown={fn} />);
    expect(textOf(box, 'typed-box-label')).toBe('Angle');
    const input = tagOf(box, 'typed-box-input');
    expect(input).toContain('value="180"');
    expect(input).toContain('aria-invalid="true"');
    expect(input).toContain('aria-label="Angle"');
  });
});

// EZD-375 M1 (vault/plans/EZD-375.md section 4; AC-EZD-375-1; 09j rows 11, 12).
describe('EZD-375 typed bar rounding', () => {
  it('EZD-375 M1 the bar shows the rounded-up half for a computed length', () => {
    expect(textOf(layer(STUB, true, { length: 150.24999999999997 }), 'typed-bar-value')).toBe(
      "12' 6 1/2\"",
    );
    expect(textOf(layer(STUB, true, { length: 143.74999999999997 }), 'typed-bar-value')).toBe(
      "12' 0\"",
    );
  });
});

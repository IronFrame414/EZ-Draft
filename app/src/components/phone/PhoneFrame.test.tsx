// EZD-014a · U4, U5, U6, U11 (vault/plans/EZD-014a.md Section 4).
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { en } from '../../server/messages/catalogs/en';
import { es } from '../../server/messages/catalogs/es';
import { PhoneFrame } from './PhoneFrame';
import { PhoneHeader } from './PhoneHeader';
import { EditorPhoneNotice } from './EditorPhoneNotice';

const KEY = 'field.device.editor_on_phone';
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const tagWith = (html: string, attr: string) => {
  const i = html.indexOf(attr);
  expect(i, `markup has ${attr}`).toBeGreaterThanOrEqual(0);
  return html.slice(html.lastIndexOf('<', i), html.indexOf('>', i) + 1);
};
const textOf = (html: string, attr: string) => {
  const i = html.indexOf(attr);
  expect(i, `markup has ${attr}`).toBeGreaterThanOrEqual(0);
  const open = html.indexOf('>', i) + 1;
  const tag = /<(\w+)/.exec(html.slice(html.lastIndexOf('<', i)))![1];
  const close = html.indexOf(`</${tag}>`, open);
  return html.slice(open, close).replace(/<[^>]*>/g, '');
};

describe('EZD-014a phone components', () => {
  it('U4 PhoneFrame orders header, main, footer', () => {
    const html = renderToStaticMarkup(
      <PhoneFrame header={<i data-h="" />} footer={<i data-f="" />}>
        <i data-m="" />
      </PhoneFrame>,
    );
    expect(html.startsWith('<div')).toBe(true);
    expect(html.slice(0, html.indexOf('>') + 1)).toContain('data-phone-region="frame"');
    expect(tagWith(html, 'data-phone-region="main"').startsWith('<main')).toBe(true);
    const idx = [
      html.indexOf('data-phone-region="frame"'),
      html.indexOf('data-h'),
      html.indexOf('<main'),
      html.indexOf('data-m'),
      html.indexOf('</main>'),
      html.indexOf('data-f'),
    ];
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(idx.every((n) => n >= 0)).toBe(true);
    expect(count(html, /<main/g)).toBe(1);
    expect(html.endsWith('</div>')).toBe(true);
    const bare = renderToStaticMarkup(
      <PhoneFrame header={<i data-h="" />}>
        <i data-m="" />
      </PhoneFrame>,
    );
    expect(bare.slice(bare.indexOf('</main>') + '</main>'.length)).toBe('</div>');
  });

  it('U5 PhoneHeader parts', () => {
    const one = renderToStaticMarkup(<PhoneHeader title="P" subtitle={['A', null, '', 'B']} />);
    expect(count(one, /<header/g)).toBe(1);
    expect(tagWith(one, 'data-phone-region="header"').startsWith('<header')).toBe(true);
    expect(count(one, /<h1/g)).toBe(1);
    expect(tagWith(one, 'data-phone-title=""').startsWith('<h1')).toBe(true);
    expect(textOf(one, 'data-phone-title=""')).toBe('P');
    expect(textOf(one, 'data-phone-subtitle')).toBe('A · B');
    expect(count(one, /<span aria-hidden="true"> · <\/span>/g)).toBe(1);
    expect(count(one, /data-phone-header-top/g)).toBe(0);

    const two = renderToStaticMarkup(
      <PhoneHeader title="P" subtitle={['A', null, '', 'B']} start={<i data-s="" />} />,
    );
    expect(two).toContain('data-phone-header-top');
    expect(two.indexOf('data-s')).toBeLessThan(two.indexOf('<h1'));
    expect(two.indexOf('data-s')).toBeGreaterThan(-1);

    const three = renderToStaticMarkup(<PhoneHeader title="P" end={<i data-e="" />} />);
    expect(three).toContain('data-phone-header-top');
    expect(three.indexOf('data-e')).toBeGreaterThan(-1);
    expect(three.indexOf('data-e')).toBeLessThan(three.indexOf('<h1'));

    const four = renderToStaticMarkup(<PhoneHeader title="P" subtitle={[]} />);
    expect(count(four, /data-phone-subtitle/g)).toBe(0);

    const five = renderToStaticMarkup(<PhoneHeader title="P" below={<i data-b="" />} />);
    expect(five.indexOf('data-b')).toBeGreaterThan(five.indexOf('</h1>'));
    expect(five.indexOf('data-b')).toBeLessThan(five.indexOf('</header>'));
  });

  it('EZD-014a done when: the phone notice renders the simple layout from the catalog in English and Spanish', () => {
    const fieldEn = catalogFor('field', 'en');
    const fieldEs = catalogFor('field', 'es');
    const custom = { ...fieldEn, [KEY]: 'NOTICE-T' } as typeof fieldEn;
    const render = (language: 'en' | 'es', messages: typeof fieldEn, ui: ReactElement) =>
      renderToStaticMarkup(
        <MessagesProvider language={language} messages={messages}>
          {ui}
        </MessagesProvider>,
      );
    const enText = (en as Record<string, unknown>)[KEY];
    const esText = (es as Record<string, unknown>)[KEY];
    const cases: Array<[string, string]> = [
      [render('en', fieldEn, <EditorPhoneNotice title="P" />), String(enText)],
      [render('es', fieldEs, <EditorPhoneNotice title="P" />), String(esText)],
      [render('en', custom, <EditorPhoneNotice title="P" />), 'NOTICE-T'],
    ];
    for (const [html, text] of cases) {
      expect(textOf(html, 'data-phone-notice')).toBe(text);
      expect(count(html, /data-phone-region="header"/g)).toBe(1);
      expect(count(html, /data-phone-region="frame"/g)).toBe(1);
      expect(count(html, /<main/g)).toBe(1);
    }
    const noTitle = [
      render('en', fieldEn, <EditorPhoneNotice />),
      renderToStaticMarkup(
        <MessagesProvider language="en" messages={catalogFor('office', 'en') as typeof fieldEn}>
          <EditorPhoneNotice />
        </MessagesProvider>,
      ),
    ];
    for (const html of [...cases.map((c) => c[0]), ...noTitle]) {
      for (const re of [
        /data-shell-region/g,
        /data-rail-tool/g,
        /data-status/g,
        /<aside/g,
        /<footer/g,
        /<nav/g,
      ]) {
        expect(count(html, re), String(re)).toBe(0);
      }
    }
    for (const html of noTitle) {
      expect(count(html, /data-phone-region="header"/g)).toBe(0);
      expect(count(html, /<header/g)).toBe(0);
    }
    expect(textOf(noTitle[1], 'data-phone-notice')).toBe(String(enText));
  });

  it('U11 catalog text', () => {
    expect((en as Record<string, unknown>)[KEY]).toBe(
      'Editing is done on an iPad or a computer. Open this project there.',
    );
    const e = (es as Record<string, unknown>)[KEY];
    expect(typeof e).toBe('string');
    expect((e as string).trim()).not.toBe('');
    expect(e).not.toBe((en as Record<string, unknown>)[KEY]);
  });
});

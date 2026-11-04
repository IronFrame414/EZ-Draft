// EZD-136 · U1-U4: catalog entries, Disclaimer markup, the editor status bar and the phone notice
// (vault/plans/EZD-136.md sections 3, 4; AC-EZD-136-1, AC-EZD-136-2).
// Sources: D-EN Q-0208; D-ES section 6 W1; N-EN Q-0273 (b) and its wording row (decisions 04); N-ES section 6
// W3; Decided "Key and namespace", "Element", "Tooltip"; section 3 markup.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import type { Language, Message, Surface } from '../../lib/messages/types';
import { catalogFor } from '../../server/messages/catalog';
import { en } from '../../server/messages/catalogs/en';
import { es } from '../../server/messages/catalogs/es';
import { EditorPhoneNotice } from '../phone/EditorPhoneNotice';
import { StatusBar, StatusItem } from '../shell/StatusBar';

const D_EN =
  "For design and planning only. All calculations and codes must be verified by the user and a licensed professional in the project's jurisdiction.";
const D_ES =
  'Solo para diseño y planificación. Todos los cálculos y códigos deben ser verificados por el usuario y por un profesional con licencia en la jurisdicción del proyecto.';
const N_EN = 'Page not found.';
const N_ES = 'Página no encontrada.';

type Catalog = Readonly<Partial<Record<string, Message>>>;

function render(ui: ReactElement, language: Language, messages: Catalog): string {
  return renderToStaticMarkup(
    <MessagesProvider
      language={language}
      messages={messages as Parameters<typeof MessagesProvider>[0]['messages']}
    >
      {ui}
    </MessagesProvider>,
  );
}

const decode = (s: string) =>
  s
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const count = (html: string, s: string) => html.split(s).length - 1;

// The disclaimer's opening tag and its text (the tag holds no child elements: section 3 markup).
function disclaimer(html: string): { tag: string; text: string; index: number } {
  const m = /<p\b[^>]*data-testid="disclaimer"[^>]*>([^<]*)<\/p>/.exec(html);
  expect(m, 'markup holds p[data-testid="disclaimer"]').not.toBeNull();
  const tag = m![0].slice(0, m![0].indexOf('>') + 1);
  return { tag, text: decode(m![1]), index: m!.index };
}

const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? decode(m[1]) : null;
};

describe('EZD-136 disclaimer', () => {
  it('U1 catalog: common.disclaimer and error.page_not_found in en and es and in every surface catalog', () => {
    const enMap = en as Readonly<Record<string, unknown>>;
    const esMap = es as Readonly<Record<string, unknown>>;
    expect(enMap['common.disclaimer']).toBe(D_EN);
    expect(esMap['common.disclaimer']).toBe(D_ES);
    expect(Object.values(enMap).filter((v) => v === D_EN)).toHaveLength(1);
    expect(Object.values(esMap).filter((v) => v === D_ES)).toHaveLength(1);
    expect(enMap['error.page_not_found']).toBe(N_EN);
    expect(esMap['error.page_not_found']).toBe(N_ES);
    const cases: [Surface, Language][] = [
      ['office', 'en'],
      ['field', 'en'],
      ['field', 'es'],
      ['client', 'en'],
      ['dev', 'en'],
      ['sign_in', 'en'],
      ['sign_in', 'es'],
    ];
    for (const [surface, language] of cases) {
      const cat = catalogFor(surface, language) as Catalog;
      expect(cat['common.disclaimer'], `${surface}/${language}`).toBe(
        language === 'es' ? D_ES : D_EN,
      );
    }
    expect((catalogFor('sign_in', 'en') as Catalog)['error.page_not_found']).toBe(N_EN);
    expect((catalogFor('sign_in', 'es') as Catalog)['error.page_not_found']).toBe(N_ES);
  });

  it('U2 component: one p with the placement, the catalog text, and a title on bar only', async () => {
    const { Disclaimer } = await import('./Disclaimer');
    const cases: {
      placement: 'bar' | 'page';
      language: Language;
      messages: Catalog;
      text: string;
    }[] = [
      { placement: 'bar', language: 'en', messages: catalogFor('office', 'en'), text: D_EN },
      { placement: 'page', language: 'en', messages: catalogFor('office', 'en'), text: D_EN },
      { placement: 'page', language: 'es', messages: catalogFor('field', 'es'), text: D_ES },
      {
        placement: 'page',
        language: 'en',
        messages: { ...catalogFor('field', 'en'), 'common.disclaimer': 'D-T' },
        text: 'D-T',
      },
    ];
    for (const c of cases) {
      const html = render(<Disclaimer placement={c.placement} />, c.language, c.messages);
      const label = `${c.placement}/${c.language}/${c.text.slice(0, 3)}`;
      expect(count(html, '<p'), label).toBe(1);
      expect(count(html, 'data-testid="disclaimer"'), label).toBe(1);
      const d = disclaimer(html);
      expect(d.tag.startsWith('<p'), label).toBe(true);
      expect(attr(d.tag, 'data-placement'), label).toBe(c.placement);
      expect(d.text, label).toBe(c.text);
      expect(attr(d.tag, 'title'), label).toBe(c.placement === 'bar' ? c.text : null);
      expect(count(html, '<footer'), label).toBe(0);
      expect(count(html, 'data-status'), label).toBe(0);
    }
  });

  it('U3 status bar: the disclaimer is the bar line after data-status="end", inside the one footer', () => {
    const uis: ReactElement[] = [
      <StatusBar key="empty" />,
      <StatusBar
        key="filled"
        start={<StatusItem label="office.shell.tools">1</StatusItem>}
        end={<span data-y="1" />}
      />,
    ];
    for (const ui of uis) {
      const html = render(ui, 'en', catalogFor('office', 'en'));
      expect(count(html, '<footer')).toBe(1);
      expect(count(html, 'data-testid="disclaimer"')).toBe(1);
      const d = disclaimer(html);
      expect(d.index).toBeGreaterThan(html.indexOf('data-status="end"'));
      expect(html.indexOf('data-status="end"')).toBeGreaterThanOrEqual(0);
      expect(d.index).toBeLessThan(html.indexOf('</footer>'));
      expect(attr(d.tag, 'data-placement')).toBe('bar');
      expect(d.text).toBe(D_EN);
    }
  });

  it('U4 phone notice: the disclaimer follows the notice inside main, with no footer or status markup', () => {
    for (const [language, text] of [
      ['en', D_EN],
      ['es', D_ES],
    ] as const) {
      const html = render(<EditorPhoneNotice title="P" />, language, catalogFor('field', language));
      expect(count(html, 'data-testid="disclaimer"'), language).toBe(1);
      const d = disclaimer(html);
      expect(attr(d.tag, 'data-placement'), language).toBe('page');
      expect(html.indexOf('data-phone-notice'), language).toBeGreaterThanOrEqual(0);
      expect(d.index, language).toBeGreaterThan(html.indexOf('data-phone-notice'));
      expect(d.index, language).toBeLessThan(html.indexOf('</main>'));
      expect(d.text, language).toBe(text);
      expect(count(html, '<footer'), language).toBe(0);
      expect(count(html, 'data-status'), language).toBe(0);
    }
  });
});

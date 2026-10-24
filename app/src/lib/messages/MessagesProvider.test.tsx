// EZD-026d A9 (vault/plans/EZD-026d.md section 4).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessagesProvider, useT } from './index';
import { catalogFor } from '../../server/messages/catalog';
import { SampleText } from '../../app/dev/messages/SampleText';

describe('EZD-026d MessagesProvider and useT', () => {
  it('A9 es provider renders Spanish text with lang es', () => {
    const html = renderToStaticMarkup(
      <MessagesProvider language="es" messages={catalogFor('dev', 'es')}>
        <SampleText />
      </MessagesProvider>,
    );
    expect(html).toContain('lang="es"');
    expect(html).toContain('Mensaje de ejemplo');
    expect(html).toContain('1 elemento');
    expect(html).toContain('2 elementos');
  });

  it('A9 en provider renders English text with lang en', () => {
    const html = renderToStaticMarkup(
      <MessagesProvider language="en" messages={catalogFor('dev', 'en')}>
        <SampleText />
      </MessagesProvider>,
    );
    expect(html).toContain('lang="en"');
    expect(html).toContain('Sample message');
    expect(html).toContain('1 item');
    expect(html).toContain('2 items');
  });

  it('A9 useT outside a provider throws naming MessagesProvider', () => {
    expect(() => renderToStaticMarkup(<SampleText />)).toThrow(Error);
    expect(() => renderToStaticMarkup(<SampleText />)).toThrow(/MessagesProvider/);
    expect(typeof useT).toBe('function');
  });
});

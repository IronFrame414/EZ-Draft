// EZD-134 (03b Architecture rule 10 "shows the answer in Settings"): the This device card names the browser's
// answer to the persistent storage request. Wording: vault/build/assumptions.md EZD-134.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../../lib/messages';
import { catalogFor } from '../../../server/messages/catalog';
import { DeviceBody } from './StatusCards';

const html = (p: 'kept' | 'may_clear' | 'unsupported') =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <DeviceBody persistence={p} />
    </MessagesProvider>,
  );

describe('EZD-134 device card', () => {
  it('names each answer', () => {
    expect(html('kept')).toContain('Kept on this device');
    expect(html('kept')).toContain('data-persistence="kept"');
    expect(html('may_clear')).toContain('The browser may clear it when space runs low');
    expect(html('unsupported')).toContain('Not available in this browser');
    expect(html('kept')).toContain('Storage');
  });
});

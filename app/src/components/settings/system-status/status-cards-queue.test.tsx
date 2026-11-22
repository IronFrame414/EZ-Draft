// EZD-1402 (phase-14 EZD-1402 "a count and size readout"; 11 Budgets decimal units, Q-0579): the This device card
// shows what waits to sync on this device. Wording: vault/build/assumptions.md EZD-1402.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../../lib/messages';
import { catalogFor } from '../../../server/messages/catalog';
import { DeviceBody } from './StatusCards';

const html = (queue?: { count: number; bytes: number } | null) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <DeviceBody persistence="kept" queue={queue} />
    </MessagesProvider>,
  );

describe('EZD-1402 device card queue readout', () => {
  it('shows the count and the size', () => {
    const out = html({ count: 3, bytes: 2_500_000 });
    expect(out).toContain('Waiting to sync');
    expect(out).toContain('3 changes · 2.5 MB');
    expect(out).toContain('data-count="3"');
    expect(out).toContain('data-bytes="2500000"');
  });

  it('one change, and none', () => {
    expect(html({ count: 1, bytes: 512 })).toContain('1 change · 512 B');
    expect(html({ count: 0, bytes: 0 })).toContain('0 changes · 0 B');
  });

  it('no row while the readout is not read', () => {
    expect(html(null)).not.toContain('Waiting to sync');
    expect(html()).not.toContain('Waiting to sync');
  });
});

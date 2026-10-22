// EZD-015a · U16 (vault/plans/EZD-015a.md Section 4). Source: S01 Loading, Error; Decided AsyncView.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { en } from '../../server/messages/catalogs/en';
import { AsyncView } from './AsyncView';
import { useAsync } from './use-async';

vi.mock('./use-async', () => ({ useAsync: vi.fn() }));

const mocked = vi.mocked(useAsync);
const E = en as unknown as Record<string, string>;
const load = vi.fn(() => Promise.resolve('D'));

function render() {
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('dev', 'en')}>
      <AsyncView load={load} skeleton={<i data-sk="" />} errorMessage="dev.messages.sample">
        {(d: string) => <b data-ok="">{d}</b>}
      </AsyncView>
    </MessagesProvider>,
  );
}

describe('EZD-015a AsyncView branches', () => {
  beforeEach(() => mocked.mockReset());

  it('U16 pending shows only the skeleton', () => {
    mocked.mockReturnValue({
      status: 'pending',
      data: undefined,
      error: undefined,
      retry: vi.fn(),
    });
    const html = render();
    expect(html).toContain('data-sk');
    expect(html).not.toContain('data-ok');
    expect(html).not.toContain('role="alert"');
    expect(mocked.mock.calls[0][0]).toBe(load);
  });

  it('U16 error shows the inline error with one Retry button', () => {
    const retry = vi.fn();
    mocked.mockReturnValue({ status: 'error', data: undefined, error: new Error('x'), retry });
    const html = render();
    expect(html).toContain('role="alert"');
    expect(html).toContain(E['dev.messages.sample']);
    expect(html.split('<button').length - 1).toBe(1);
    expect(html).toContain(`>${E['common.retry']}</button>`);
    expect(html).not.toContain('data-sk');
    expect(html).not.toContain('data-ok');
    expect(mocked.mock.calls[0][0]).toBe(load);
  });

  it('U16 ready shows the children', () => {
    mocked.mockReturnValue({ status: 'ready', data: 'D', error: undefined, retry: vi.fn() });
    const html = render();
    expect(html).toContain('<b data-ok="">D</b>');
    expect(html).not.toContain('data-sk');
    expect(html).not.toContain('role="alert"');
    expect(mocked.mock.calls[0][0]).toBe(load);
  });
});

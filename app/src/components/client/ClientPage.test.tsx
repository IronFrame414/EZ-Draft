// EZD-1202 (S18 Layout, States; board S18Client; vault/build/assumptions/EZD-1202.md Settled rows "Header and tabs",
// "Parts of the Design tab built later", wording row). The server render of each state. The version label and the
// expiring banner use the device clock and time zone, so they fill in after hydration (client-page-model.test.ts
// and app/e2e/client-page.spec.ts check them).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { ClientPage } from './ClientPage';
import type { ClientPageResult, ClientPageView } from './client-page-model';

const PAGE: ClientPageView = {
  company: 'Worth Properties',
  contact: { phone: '(904) 555-0100', email: 'office@example.test' },
  project: { name: 'Hendricks kitchen', type: 'kitchen' },
  version: { kind: 'version', no: 3, sentAt: '2026-09-26T16:00:00Z' },
  expiresAt: '2026-10-26T16:00:00Z',
  reminderLeadDays: 7,
  sharesSheets: false,
};

const render = (initial: ClientPageResult | null) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('client', 'en')}>
      <ClientPage token="t" initial={initial} />
    </MessagesProvider>,
  );

const DISCLAIMER = 'For design and planning only.';

describe('EZD-1202 client page shell', () => {
  it('an active link shows the company, the project, "Design approval", the menu and the Design tab', () => {
    const html = render({ status: 'active', page: PAGE });
    expect(html).toContain('data-client-state="active"');
    expect(html).toContain('Worth Properties');
    expect(html).toContain('Hendricks kitchen');
    expect(html).toContain('Design approval');
    expect(html).toContain('aria-label="Menu"');
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Design</);
    expect(html).toContain(DISCLAIMER);
  });

  it('parts built by later tickets stay hidden: no Plans tab, Comment, Approve or Compare', () => {
    const html = render({ status: 'active', page: { ...PAGE, sharesSheets: true } });
    for (const text of ['>Plans<', 'Approve', 'Comment', 'Compare', 'Download selections PDF']) {
      expect(html).not.toContain(text);
    }
  });

  it('an expired link says "This link has expired. Ask Worth Properties to renew it."', () => {
    const html = render({ status: 'expired', company: 'Worth Properties' });
    expect(html).toContain('This link has expired. Ask Worth Properties to renew it.');
    expect(html).toContain(DISCLAIMER);
  });

  it('a link that is no link says so, and a locked company\'s link is not available', () => {
    expect(render({ status: 'not_found' })).toContain(
      'This link isn&#x27;t working. Ask your contractor for a new one.',
    );
    expect(render({ status: 'unavailable' })).toContain('This link isn&#x27;t available.');
  });

  it('a failed load shows "Couldn\'t load this page." with Try again, never a blank page', () => {
    const html = render(null);
    expect(html).toContain('data-client-state="failed"');
    expect(html).toContain('Couldn&#x27;t load this page.');
    expect(html).toContain('>Try again</button>');
    expect(html).toContain(DISCLAIMER);
  });
});

// EZD-1711 (AC-EZD-1711-2, -3; Q-0237; Q-0795; 13b R2; wording rows in vault/build/assumptions/EZD-1711.md):
// Settings > Billing. Expected values: not found for a company that is not billed (Worth Properties); the no-access
// line without Company settings; the status lines and the plan line (Q-0237 amounts, See company costs only) from
// the wording rows; "Add a card" in the trial, "Pay now" in the 14 days, "Manage billing" always.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BillingState } from '../../../../lib/billing/plan';
import { PERMISSION_KEYS, type PermissionKey } from '../../../../lib/permissions/catalog';
import type { PermissionContext } from '../../../../server/permissions';

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  usePathname: () => '/settings/billing',
  useRouter: () => ({ push() {}, replace() {}, refresh: vi.fn() }),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('../../../../server/auth/session', () => ({
  requireSession: async () => ({ authUserId: 'a1', appUserId: 'u1', email: 'o@example.test' }),
}));
vi.mock('../../../../server/settings/shell-data', async (orig) => ({
  ...(await orig<typeof import('../../../../server/settings/shell-data')>()),
  settingsPermissionContext: vi.fn(),
}));
vi.mock('../../../../server/billing/state', () => ({ getBillingState: vi.fn() }));

import { MessagesProvider } from '../../../../lib/messages';
import { StateHost } from '../../../../components/states/StateHost';
import { getBillingState } from '../../../../server/billing/state';
import { catalogFor } from '../../../../server/messages/catalog';
import { settingsPermissionContext } from '../../../../server/settings/shell-data';
import Page from './page';

const ctx = vi.mocked(settingsPermissionContext);
const billing = vi.mocked(getBillingState);

const ctxWith = (keys: readonly PermissionKey[]): PermissionContext => ({
  appUserId: 'u1',
  membershipId: 'm1',
  scope: 'all',
  permissions: new Set<PermissionKey>(keys),
  listedProjectIds: new Set(),
});

const billed = (o: Partial<Extract<BillingState, { applies: true }>>): BillingState => ({
  applies: true,
  mode: 'full',
  status: 'active',
  daysLeft: null,
  trialEndsAt: null,
  currentPeriodEnd: null,
  hasSubscription: true,
  ...o,
});

const render = async () => {
  const el = (await Page()) as ReactElement;
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <StateHost>{el}</StateHost>
    </MessagesProvider>,
  );
};

const PLAN =
  'Plan: $50 a month · 5 office users included · $10 a month for each extra office user';

describe('EZD-1711 Settings > Billing page', () => {
  afterEach(() => {
    ctx.mockReset();
    billing.mockReset();
  });

  it('P1 AC-EZD-1711-2: not found for a company that is not billed, and with billing off', async () => {
    ctx.mockResolvedValue(ctxWith(PERMISSION_KEYS));
    billing.mockResolvedValue({ applies: false, mode: 'full' });
    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND');
    billing.mockResolvedValue(null);
    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('P2 without Company settings: the no-access line, no billing panel', async () => {
    ctx.mockResolvedValue(ctxWith(['view_projects', 'see_company_costs']));
    billing.mockResolvedValue(billed({}));
    const html = await render();
    expect(html).toContain("You don&#x27;t have access to this. Ask your supervisor.");
    expect(html).not.toContain('data-billing-status');
  });

  it('P3 the trial: days left, Add a card, Manage billing, and the plan with See company costs', async () => {
    ctx.mockResolvedValue(ctxWith(['settings_company', 'see_company_costs']));
    billing.mockResolvedValue(billed({ status: 'trialing', daysLeft: 9, hasSubscription: true }));
    const html = await render();
    expect(html).toContain('Free trial · 9 days left');
    expect(html).toContain('Add a card');
    expect(html).toContain('Manage billing');
    expect(html).toContain(PLAN);
  });

  it('P4 R2: no dollar amounts without See company costs', async () => {
    ctx.mockResolvedValue(ctxWith(['settings_company']));
    billing.mockResolvedValue(billed({ status: 'trialing', daysLeft: 1 }));
    const html = await render();
    expect(html).toContain('Free trial · 1 day left');
    expect(html).not.toContain('$');
  });

  it('P5 AC-EZD-1711-3: in the 14 days, the days left and Pay now', async () => {
    ctx.mockResolvedValue(ctxWith(['settings_company']));
    billing.mockResolvedValue(billed({ mode: 'grace', status: 'unpaid', daysLeft: 3 }));
    const html = await render();
    expect(html).toContain(
      'Your subscription has ended. You can view and export projects for 3 more days.',
    );
    expect(html).toContain('Pay now');
    expect(html).not.toContain('Add a card');
  });

  it('P6 a failed payment and an active subscription', async () => {
    ctx.mockResolvedValue(ctxWith(['settings_company']));
    billing.mockResolvedValue(billed({ status: 'past_due' }));
    expect(await render()).toContain(
      'Your payment didn&#x27;t go through. Update your card to keep using EZ Draft.',
    );
    billing.mockResolvedValue(billed({ status: 'active' }));
    const html = await render();
    expect(html).toContain('Subscription active');
    expect(html).not.toContain('Pay now');
    expect(html).not.toContain('Add a card');
  });
});

// EZD-112 T12 (vault/plans/EZD-112.md section 4; AC-EZD-112-1, -9). Mocks as in
// app/src/server/settings/settings-root.test.tsx. Expected values: Decided "Page": when `loadCompany` throws
// or finds no row, `reportError(new Error('company_load_failed'), { source: 'function', location:
// 'settings.company' })` is called once (code only) and the load error shows; with data the form shows and
// nothing is reported.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION_KEYS, type PermissionKey } from '../../../../lib/permissions/catalog';
import type { PermissionContext } from '../../../../server/permissions';

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  usePathname: () => '/settings/company',
  useRouter: () => ({ push() {}, replace() {}, refresh: vi.fn() }),
}));
vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('../../../../server/auth/session', () => ({
  requireSession: async () => ({ authUserId: 'a1', appUserId: 'u1', email: 'josh@example.com' }),
}));
vi.mock('../../../../server/auth/supabase-server', () => ({ createSessionClient: () => ({}) }));
vi.mock('../../../../server/errors/report', () => ({ reportError: vi.fn(async () => ({})) }));
vi.mock('../../../../server/settings/shell-data', async (orig) => ({
  ...(await orig<typeof import('../../../../server/settings/shell-data')>()),
  settingsPermissionContext: vi.fn(),
}));
vi.mock('../../../../server/company/company', async (orig) => ({
  ...(await orig<typeof import('../../../../server/company/company')>()),
  loadCompany: vi.fn(),
}));

import type { CompanyData } from '../../../../lib/company/company';
import { MessagesProvider } from '../../../../lib/messages';
import { StateHost } from '../../../../components/states/StateHost';
import { UnsavedChangesProvider } from '../../../../components/settings/unsaved-changes';
import { loadCompany } from '../../../../server/company/company';
import { reportError } from '../../../../server/errors/report';
import { catalogFor } from '../../../../server/messages/catalog';
import { settingsPermissionContext } from '../../../../server/settings/shell-data';
import Page from './page';

const ctx = vi.mocked(settingsPermissionContext);
const load = vi.mocked(loadCompany);
const report = vi.mocked(reportError);

const ctxWith = (keys: readonly PermissionKey[]): PermissionContext => ({
  appUserId: 'u1',
  membershipId: 'm1',
  scope: 'all',
  permissions: new Set<PermissionKey>(keys),
  listedProjectIds: new Set(),
});
const DATA = {
  name: 'Acme Co',
  licenseNo: 'LIC-1',
  contact: {
    phone: '555-0100',
    email: 'office@acme.test',
    website: 'acme.test',
    address: '1 Main St',
  },
  logo: { path: 't/tenant/logo/u.svg', url: 'https://x.test/s.svg?token=t', kind: 'svg' },
} satisfies CompanyData;

const render = async () => {
  const el = (await Page()) as ReactElement;
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <StateHost>
        <UnsavedChangesProvider draftScope="m1">{el}</UnsavedChangesProvider>
      </StateHost>
    </MessagesProvider>,
  );
};

const expectOneLoadReport = () => {
  expect(report).toHaveBeenCalledTimes(1);
  const [err, where] = report.mock.calls[0];
  expect(err).toBeInstanceOf(Error);
  expect((err as Error).message).toBe('company_load_failed');
  expect(where).toEqual({ source: 'function', location: 'settings.company' });
};

describe('EZD-112 company page load', () => {
  afterEach(() => {
    ctx.mockReset();
    load.mockReset();
    report.mockClear();
  });

  it('T12 (a) loadCompany rejects: load error, one report, no form', async () => {
    ctx.mockResolvedValue(ctxWith(PERMISSION_KEYS));
    load.mockRejectedValue(new Error('db down'));
    const html = await render();
    expect(html).toContain('data-testid="company-load-error"');
    expect(html).not.toContain('data-testid="company-form"');
    expectOneLoadReport();
  });

  it('T12 (b) loadCompany finds no row: load error and one report', async () => {
    ctx.mockResolvedValue(ctxWith(PERMISSION_KEYS));
    load.mockResolvedValue(null);
    const html = await render();
    expect(html).toContain('data-testid="company-load-error"');
    expectOneLoadReport();
  });

  it('T12 (c) data: the form shows, nothing is reported', async () => {
    ctx.mockResolvedValue(ctxWith(PERMISSION_KEYS));
    load.mockResolvedValue(DATA);
    const html = await render();
    expect(html).toContain('data-testid="company-form"');
    expect(html).not.toContain('data-testid="company-load-error"');
    expect(report).not.toHaveBeenCalled();
  });
});

// EZD-135b U5 (vault/plans/EZD-135b.md section 4; AC-EZD-135-1; Q-0225; S15i System status board). Mocks as in
// app/src/app/(office)/settings/company/page.test.tsx. Expected values: without the System status switch the
// no-access line in place; with it the page title "System status" (en.ts office.settings.section.system_status),
// the approved subtitle (S15i W2), Refresh (W4) and the four cards in iPad order (backup and restore drill first,
// S15i iPad), each showing a 3-line skeleton (no server data load); a failed context load returns null.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PERMISSION_KEYS, type PermissionKey } from '../../../../lib/permissions/catalog';
import type { PermissionContext } from '../../../../server/permissions';

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  usePathname: () => '/settings/system-status',
  useRouter: () => ({ push() {}, replace() {}, refresh: vi.fn() }),
}));
vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('../../../../server/auth/session', () => ({
  requireSession: async () => ({ authUserId: 'a1', appUserId: 'u1', email: 'josh@example.com' }),
}));
vi.mock('../../../../server/auth/supabase-server', () => ({ createSessionClient: () => ({}) }));
vi.mock('../../../../server/settings/shell-data', async (orig) => ({
  ...(await orig<typeof import('../../../../server/settings/shell-data')>()),
  settingsPermissionContext: vi.fn(),
}));

import { MessagesProvider } from '../../../../lib/messages';
import { catalogFor } from '../../../../server/messages/catalog';
import { settingsPermissionContext } from '../../../../server/settings/shell-data';
import Page from './page';

const ctx = vi.mocked(settingsPermissionContext);

const ctxWith = (keys: readonly PermissionKey[]): PermissionContext => ({
  appUserId: 'u1',
  membershipId: 'm1',
  scope: 'all',
  permissions: new Set<PermissionKey>(keys),
  listedProjectIds: new Set(),
});

const render = async () => {
  const el = (await Page()) as ReactElement;
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      {el}
    </MessagesProvider>,
  );
};

const count = (html: string, s: string) => html.split(s).length - 1;

describe('EZD-135b system status page', () => {
  it('U5 (a) without the switch, NoAccess in place', async () => {
    ctx.mockResolvedValue(ctxWith(['settings_company']));
    const html = await render();
    expect(html).toContain('data-testid="no-access"');
    expect(html).not.toMatch(/data-settings-page="[^"]+"/);
    expect(html).not.toContain('system-status-panel');
  });

  it('U5 (b) with the switch, four cards loading', async () => {
    ctx.mockResolvedValue(ctxWith(PERMISSION_KEYS));
    const html = await render();
    expect(html).toContain('data-settings-page="system_status"');
    expect(html).toMatch(/<h1[^>]*>System status<\/h1>/);
    expect(html).toContain(
      'Failed background work, backups and how fast the plan editor runs. Only people with the System status switch see this page.',
    );
    expect(html).toContain('data-testid="system-status-refresh"');
    expect(html).toContain('Refresh');
    expect(html).toContain('system-status-panel');
    const order = ['backups', 'drill', 'webhooks', 'jobs'].map((id) =>
      html.indexOf(`data-testid="system-status-${id}"`),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const id of ['backups', 'drill', 'webhooks', 'jobs']) {
      const start = html.indexOf(`data-testid="system-status-${id}-body"`);
      const end = html.indexOf('</section>', start);
      expect(count(html.slice(start, end), 'data-skeleton-group=""')).toBe(1);
    }
    expect(count(html, 'data-skeleton=""')).toBe(12);
  });

  it('U5 (c) context load failed returns null', async () => {
    ctx.mockResolvedValue('failed');
    expect(await Page()).toBeNull();
  });
});

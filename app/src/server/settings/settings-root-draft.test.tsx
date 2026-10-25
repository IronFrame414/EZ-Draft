// EZD-103b U14 (vault/plans/EZD-103b.md sections 1, 3, 4; AC-EZD-103-5).
// Expected values: plan section 1 Decided "Draft lifetime" (draftScope = ctx?.membershipId ??
// session.appUserId) and step 9. Mocks: the seven of the merged EZD-103a U9 file (settings-root.test.tsx
// lines 11-28, copied as they are) plus SettingsShell, which shows the draftScope it receives.
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PERMISSION_KEYS, type PermissionKey } from '../../lib/permissions/catalog';
import type { PermissionContext } from '../permissions';

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  usePathname: () => '/settings/company',
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('../auth/session', () => ({
  requireSession: async () => ({ authUserId: 'a1', appUserId: 'u1', email: 'josh@example.com' }),
}));
vi.mock('../permissions', async (orig) => ({
  ...(await orig<typeof import('../permissions')>()),
  getPermissionContext: vi.fn(),
}));
vi.mock('../auth/supabase-server', () => ({ createSessionClient: () => ({}) }));
vi.mock('../errors/report', () => ({ reportError: vi.fn(async () => ({})) }));
vi.mock('./shell-data', async (orig) => ({
  ...(await orig<typeof import('./shell-data')>()),
  loadSettingsShellData: vi.fn(async () => ({
    companyName: 'Worth Properties',
    initials: 'JB',
    activeMembers: 3,
  })),
}));
vi.mock('../../components/settings/SettingsShell', async (orig) => ({
  ...(await orig<typeof import('../../components/settings/SettingsShell')>()),
  SettingsShell: (p: { draftScope: string; children: ReactNode }) => (
    <div data-draft-scope={p.draftScope}>{p.children}</div>
  ),
}));

import { getPermissionContext } from '../permissions';
import { SettingsRoot } from './settings-root';

const getCtx = vi.mocked(getPermissionContext);

const count = (html: string, needle: string) => html.split(needle).length - 1;
const render = async () => renderToStaticMarkup(await SettingsRoot({ children: <p data-c="" /> }));

describe('EZD-103b settings root draft scope', () => {
  it('U14 (a) with a permission context the draft scope is the membership id', async () => {
    const ctx: PermissionContext = {
      appUserId: 'u1',
      membershipId: 'm1',
      scope: 'all',
      permissions: new Set<PermissionKey>(PERMISSION_KEYS),
      listedProjectIds: new Set(),
    };
    getCtx.mockResolvedValue(ctx);
    const html = await render();
    expect(html).toContain('data-draft-scope="m1"');
    expect(count(html, 'data-c=""')).toBe(1);
  });

  it('U14 (b) ctx null: the draft scope is the app user id', async () => {
    getCtx.mockResolvedValue(null);
    const html = await render();
    expect(html).toContain('data-draft-scope="u1"');
    expect(count(html, 'data-c=""')).toBe(1);
  });
});

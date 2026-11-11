// EZD-104 U8 (vault/plans/EZD-104.md section 4; AC-EZD-104-5). Expected values: architecture "Settings shell"
// page-ticket contract and AC-EZD-103-4: with the Users switch the page holds the users body; without it
// the no-access line in place (no data-settings-page); a failed context load renders nothing (null). Mocks
// as in app/src/app/(office)/settings/settings-pages.test.tsx lines 12-26. Preset arrays from
// supabase/migrations/20261024100001_create_permission_catalog.sql (Crew).
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION_KEYS, type PermissionKey } from '../../../../lib/permissions/catalog';
import type { PermissionContext } from '../../../../server/permissions';

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  usePathname: () => '/settings/users',
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('../../../../server/auth/session', () => ({
  requireSession: async () => ({ authUserId: 'a1', appUserId: 'u1', email: 'josh@example.com' }),
}));
vi.mock('../../../../server/permissions', async (orig) => ({
  ...(await orig<typeof import('../../../../server/permissions')>()),
  getPermissionContext: vi.fn(),
}));
vi.mock('../../../../server/auth/supabase-server', () => ({ createSessionClient: () => ({}) }));
vi.mock('../../../../server/errors/report', () => ({ reportError: vi.fn(async () => ({})) }));

import { MessagesProvider } from '../../../../lib/messages';
import { StateHost } from '../../../../components/states/StateHost';
import { UnsavedChangesProvider } from '../../../../components/settings/unsaved-changes';
import { catalogFor } from '../../../../server/messages/catalog';
import { getPermissionContext } from '../../../../server/permissions';
import Page from './page';

const getCtx = vi.mocked(getPermissionContext);
const CREW: PermissionKey[] = ['view_projects', 'check_off_tasks', 'photo_notes', 'flag_conflict'];

const ctxWith = (keys: readonly PermissionKey[]): PermissionContext => ({
  appUserId: 'u1',
  membershipId: 'm1',
  scope: 'all',
  permissions: new Set<PermissionKey>(keys),
  listedProjectIds: new Set(),
});

const render = (el: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <StateHost>
        <UnsavedChangesProvider draftScope="m1">{el}</UnsavedChangesProvider>
      </StateHost>
    </MessagesProvider>,
  );

describe('EZD-104 users page', () => {
  afterEach(() => {
    getCtx.mockReset();
  });

  it('U8 page: switch, no access, failed', async () => {
    getCtx.mockResolvedValue(ctxWith(PERMISSION_KEYS));
    const withSwitch = render((await Page()) as ReactElement);
    expect(withSwitch).toContain('data-settings-page="users"');
    expect(withSwitch).toContain('data-testid="users-body"');

    getCtx.mockResolvedValue(ctxWith(CREW));
    const noAccess = render((await Page()) as ReactElement);
    expect(noAccess).toContain('data-testid="no-access"');
    expect(noAccess).not.toContain('data-settings-page');

    getCtx.mockRejectedValue(new Error('db down'));
    expect(await Page()).toBeNull();
  });
});

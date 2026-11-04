// Moved from app/src/app/page.test.tsx by EZD-117a E5 (vault/plans/EZD-117a.md section 4): the home page is now
// app/src/app/(office)/page.tsx; only the import and vi.mock paths changed, no assertion.
// EZD-289 U1–U5 (vault/plans/EZD-289.md sections 1, 3, 4; AC-EZD-289-1, -2). Expected values: plan Decided
// "Who sees the link", "Hidden, not disabled", "Load failure", "Order and place" and "Link text"; decisions/04
// row 2026-11-02 (the link, its text "Settings", to users who may open Settings); Q-0223 (presets: Owner all,
// Crew none); Q-0214 (hidden controls, never a blank page); P103a "used" row (can(null) is false). Owner is
// PERMISSION_KEYS; the Crew preset is copied from settings-pages.test.tsx lines 36–49 (migration
// 20261024100001_create_permission_catalog.sql, Q-0223). Mocks: plan section 4.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION_KEYS, type PermissionKey } from '../../lib/permissions/catalog';
import type { PermissionContext } from '../../server/permissions';

vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('../../server/auth/session', () => ({
  requireSession: async () => ({ authUserId: 'a1', appUserId: 'u1', email: 'josh@example.com' }),
}));
vi.mock('../../server/permissions', async (orig) => ({
  ...(await orig<typeof import('../../server/permissions')>()),
  getPermissionContext: vi.fn(),
}));
vi.mock('../../server/auth/supabase-server', () => ({ createSessionClient: () => ({}) }));
vi.mock('../../server/errors/report', () => ({ reportError: vi.fn(async () => ({})) }));
vi.mock('../../server/auth/actions', () => ({
  signOut: vi.fn(),
  requestSignIn: vi.fn(),
  verifySignInCode: vi.fn(),
  confirmSignInLink: vi.fn(),
  setSignInLanguage: vi.fn(),
  clearSignInEmail: vi.fn(),
}));

import { getPermissionContext } from '../../server/permissions';
import { reportError } from '../../server/errors/report';
import Page from './page';

const getCtx = vi.mocked(getPermissionContext);
const report = vi.mocked(reportError);

const CREW: PermissionKey[] = ['view_projects', 'check_off_tasks', 'photo_notes', 'flag_conflict'];

const ctxWith = (keys: readonly PermissionKey[]): PermissionContext => ({
  appUserId: 'u1',
  membershipId: 'm1',
  scope: 'all',
  permissions: new Set<PermissionKey>(keys),
  listedProjectIds: new Set(),
});

const renderHome = async () => renderToStaticMarkup((await Page()) as ReactElement);

// The Settings link element(s): every <a> carrying data-testid="home-settings".
const settingsLinks = (html: string): string[] =>
  html.match(/<a\b[^>]*data-testid="home-settings"[^>]*>[^<]*<\/a>/g) ?? [];

describe('EZD-289 home page Settings link', () => {
  afterEach(() => {
    getCtx.mockReset();
    report.mockClear();
  });

  it('U1 owner: one Settings link to /settings with the text Settings, before Sign out; no report', async () => {
    getCtx.mockResolvedValue(ctxWith(PERMISSION_KEYS));
    const html = await renderHome();
    const links = settingsLinks(html);
    expect(links).toHaveLength(1);
    expect(links[0]).toContain('href="/settings"');
    expect(/<a\b[^>]*>([^<]*)<\/a>/.exec(links[0])?.[1]).toBe('Settings');
    expect(html.indexOf('data-testid="home-settings"')).toBeLessThan(
      html.indexOf('data-testid="sign-out"'),
    );
    expect(report).not.toHaveBeenCalled();
  });

  it('U2 crew: no Settings link; Sign out present', async () => {
    getCtx.mockResolvedValue(ctxWith(CREW));
    const html = await renderHome();
    expect(html).not.toContain('data-testid="home-settings"');
    expect(html).toContain('data-testid="sign-out"');
  });

  it('U3 no membership (null context): no Settings link; Sign out present; no report', async () => {
    getCtx.mockResolvedValue(null);
    const html = await renderHome();
    expect(html).not.toContain('data-testid="home-settings"');
    expect(html).toContain('data-testid="sign-out"');
    expect(report).not.toHaveBeenCalled();
  });

  it('U4 load failure: no Settings link; Sign out and the disclaimer render; reported once', async () => {
    getCtx.mockRejectedValue(new Error('x'));
    const html = await renderHome();
    expect(html).not.toContain('data-testid="home-settings"');
    expect(html).toContain('data-testid="sign-out"');
    expect(html).toContain('data-testid="disclaimer"');
    expect(report).toHaveBeenCalledTimes(1);
    const [error, where] = report.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('home_permissions_load_failed');
    expect(where).toEqual({ source: 'function', location: 'home.settings_link' });
  });

  it('U5 one Settings switch (System status) alone: one Settings link', async () => {
    getCtx.mockResolvedValue(ctxWith(['view_projects', 'settings_system_status']));
    const html = await renderHome();
    expect(settingsLinks(html)).toHaveLength(1);
  });
});

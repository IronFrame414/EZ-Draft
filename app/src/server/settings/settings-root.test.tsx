// EZD-103a U9 (vault/plans/EZD-103a.md sections 3, 4; AC-EZD-103-1, AC-EZD-103-6).
// Expected values: plan Decided "Root", "Load failure" (reportError with the code only, location
// settings.shell, ARCH Error reporting "Convention"), "Nav filtering" (ctx null → no items),
// `settingsPermissionContext` ('failed' on a rejected context load). Mocks: section 4 U9 row.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  loadSettingsShellData: vi.fn(),
}));

import { reportError } from '../errors/report';
import { getPermissionContext } from '../permissions';
import { SettingsRoot } from './settings-root';
import { loadSettingsShellData, settingsPermissionContext } from './shell-data';

const getCtx = vi.mocked(getPermissionContext);
const load = vi.mocked(loadSettingsShellData);
const report = vi.mocked(reportError);

const ctxWith = (keys: readonly PermissionKey[]): PermissionContext => ({
  appUserId: 'u1',
  membershipId: 'm1',
  scope: 'all',
  permissions: new Set<PermissionKey>(keys),
  listedProjectIds: new Set(),
});
const DATA = { companyName: 'Worth Properties', initials: 'JB', activeMembers: 3 };

const count = (html: string, needle: string) => html.split(needle).length - 1;
const navCount = (html: string) => (html.match(/\bdata-settings-nav="/g) ?? []).length;
const render = async () => renderToStaticMarkup(await SettingsRoot({ children: <p data-c="" /> }));

const expectOneFailureReport = () => {
  expect(report).toHaveBeenCalledTimes(1);
  const [err, ctx] = report.mock.calls[0];
  expect(err).toBeInstanceOf(Error);
  expect((err as Error).message).toBe('settings_shell_load_failed');
  expect(ctx).toEqual({ source: 'function', location: 'settings.shell' });
};

describe('EZD-103a settings root', () => {
  afterEach(() => {
    getCtx.mockReset();
    load.mockReset();
    report.mockClear();
  });

  it('U9 (a) context load rejects: load error, no children, one report, loader not called', async () => {
    getCtx.mockRejectedValue(new Error('db down'));
    const html = await render();
    expect(html).toContain('data-settings-load-error');
    expect(html).not.toContain('data-c=""');
    expectOneFailureReport();
    expect(load).toHaveBeenCalledTimes(0);
  });

  it('U9 (b) loader returns null: load error and one report', async () => {
    getCtx.mockResolvedValue(ctxWith(PERMISSION_KEYS));
    load.mockResolvedValue(null);
    const html = await render();
    expect(html).toContain('data-settings-load-error');
    expect(html).not.toContain('data-c=""');
    expectOneFailureReport();
  });

  it('U9 (c) all keys and data: the shell with 10 items, users badge 3, no report', async () => {
    getCtx.mockResolvedValue(ctxWith(PERMISSION_KEYS));
    load.mockResolvedValue(DATA);
    const html = await render();
    expect(html).toContain('data-settings-region="frame"');
    expect(count(html, 'data-c=""')).toBe(1);
    expect(navCount(html)).toBe(10);
    expect(/<span\b[^>]*\bdata-settings-badge="users"[^>]*>([^<]*)<\/span>/.exec(html)?.[1]).toBe(
      '3',
    );
    expect(report).toHaveBeenCalledTimes(0);
  });

  it('U9 (d) ctx null: no nav items, children once', async () => {
    getCtx.mockResolvedValue(null);
    load.mockResolvedValue(DATA);
    const html = await render();
    expect(navCount(html)).toBe(0);
    expect(count(html, 'data-c=""')).toBe(1);
  });

  it('U9 (e) settingsPermissionContext answers failed when the context load rejects', async () => {
    getCtx.mockRejectedValue(new Error('db down'));
    await expect(settingsPermissionContext()).resolves.toBe('failed');
  });
});

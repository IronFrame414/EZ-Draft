// EZD-1994 (performance audit 2026-11-26, Q-0814; 11 Budgets "Projects page"): the Projects page starts its two server
// reads (the permissions and the signed-in account) together, so the page waits for the slower read and not for their
// sum. Both reads are held open here; both must have started before either answers.
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('../../server/auth/session', () => ({
  requireSession: async () => ({ authUserId: 'a1', appUserId: 'u1', email: 'josh@example.com' }),
}));
vi.mock('../../server/auth/supabase-server', () => ({ createSessionClient: () => ({}) }));
vi.mock('../../server/errors/report', () => ({ reportError: vi.fn(async () => ({})) }));
vi.mock('../../server/settings/shell-data', () => ({ settingsPermissionContext: vi.fn() }));
vi.mock('../../server/projects/account', () => ({ loadProjectsAccount: vi.fn() }));
vi.mock('../../components/projects/ProjectsView', () => ({
  ProjectsView: () => null,
  ProjectsNoAccessView: () => null,
}));

import { ProjectsNoAccessView, ProjectsView } from '../../components/projects/ProjectsView';
import { reportError } from '../../server/errors/report';
import { loadProjectsAccount } from '../../server/projects/account';
import { settingsPermissionContext } from '../../server/settings/shell-data';
import Page from './page';

function held<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

const ACCOUNT = { name: 'Josh Bishop', email: 'josh@example.com', initials: 'JB' };

/** The props of the first element of the given component type in a server-rendered tree. */
function propsOf(node: unknown, type: unknown): Record<string, unknown> | null {
  if (node === null || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = propsOf(child, type);
      if (found) return found;
    }
    return null;
  }
  const el = node as ReactElement<Record<string, unknown>>;
  if (el.type === type) return el.props;
  return propsOf(el.props?.children, type);
}

afterEach(() => {
  vi.mocked(reportError).mockClear();
  vi.mocked(loadProjectsAccount).mockReset();
  vi.mocked(settingsPermissionContext).mockReset();
});

describe('EZD-1994 AC-EZD-1994-2 Projects page server reads run together', () => {
  it('AC-EZD-1994-3 both reads have started before either answers, and the account still reaches the view', async () => {
    const ctx = held<null>();
    const account = held<typeof ACCOUNT>();
    vi.mocked(settingsPermissionContext).mockReturnValue(ctx.promise);
    vi.mocked(loadProjectsAccount).mockReturnValue(account.promise);

    let done = false;
    const page = Page().then((el) => {
      done = true;
      return el;
    });
    await tick();
    expect(settingsPermissionContext).toHaveBeenCalledTimes(1);
    expect(loadProjectsAccount).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);

    // The account answers first (the old order waited for the permissions before asking for it).
    account.resolve(ACCOUNT);
    await tick();
    expect(done).toBe(false);
    ctx.resolve(null);

    // No permission context: the No access view, with the account and no Settings gear (EZD-289).
    const tree = await page;
    expect(propsOf(tree, ProjectsView)).toBeNull();
    expect(propsOf(tree, ProjectsNoAccessView)?.account).toEqual({ ...ACCOUNT, showSettings: false });
    expect(reportError).not.toHaveBeenCalled();
  });

  it('AC-EZD-1994-3 a failed permission load is still reported once and the page still shows', async () => {
    vi.mocked(settingsPermissionContext).mockResolvedValue('failed');
    vi.mocked(loadProjectsAccount).mockResolvedValue(ACCOUNT);
    const tree = await Page();
    expect(propsOf(tree, ProjectsView)?.account).toEqual({ ...ACCOUNT, showSettings: false });
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reportError).mock.calls[0]?.[1]).toEqual({
      source: 'function',
      location: 'home.settings_link',
    });
  });

  it('a failed permission load is still reported when the account read fails too, then the failure is thrown', async () => {
    vi.mocked(settingsPermissionContext).mockResolvedValue('failed');
    vi.mocked(loadProjectsAccount).mockRejectedValue(new Error('account down'));
    await expect(Page()).rejects.toThrow('account down');
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reportError).mock.calls[0]?.[1]).toEqual({
      source: 'function',
      location: 'home.settings_link',
    });
  });
});

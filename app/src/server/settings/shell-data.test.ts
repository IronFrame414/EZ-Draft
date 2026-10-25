// EZD-103a U3 (vault/plans/EZD-103a.md sections 3, 4; AC-EZD-103-6).
// Expected values: plan Decided "Loader" and "Active-member count" (S15 Controls: Users badge = active
// user count); session and data inputs from the section 4 U3 row.
import { describe, expect, it } from 'vitest';
import type { PermissionKey } from '../../lib/permissions/catalog';
import type { Session } from '../auth/session';
import type { PermissionContext } from '../permissions';
import { loadSettingsShellData } from './shell-data';

type Call = [string, ...unknown[]];
type Result = { data?: unknown; error?: unknown; count?: number | null };

// Section 4 fake client: from(table) returns a builder recording [method, ...args] per table; select and
// eq return the builder; maybeSingle() resolves the { data, error } given for that table; the builder is
// thenable and resolves the { count, error } given for membership.
function fakeClient(results: Record<string, Result>) {
  const calls: Record<string, Call[]> = {};
  const from = (table: string) => {
    const list: Call[] = (calls[table] ??= []);
    const r = results[table] ?? {};
    const builder = {
      select: (...args: unknown[]) => {
        list.push(['select', ...args]);
        return builder;
      },
      eq: (...args: unknown[]) => {
        list.push(['eq', ...args]);
        return builder;
      },
      maybeSingle: () => {
        list.push(['maybeSingle']);
        return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
      },
      then: (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
        Promise.resolve({ count: r.count ?? null, error: r.error ?? null }).then(onOk, onErr),
    };
    return builder;
  };
  return { client: { from } as never, calls };
}

const session: Session = { authUserId: 'a1', appUserId: 'u1', email: 'josh@example.com' };

const ctxWith = (keys: PermissionKey[]): PermissionContext => ({
  appUserId: 'u1',
  membershipId: 'm1',
  scope: 'all',
  permissions: new Set<PermissionKey>(keys),
  listedProjectIds: new Set(),
});

const WITH_USERS = ctxWith(['view_projects', 'settings_users']);
const WITHOUT_USERS = ctxWith(['view_projects', 'settings_company']);

const TENANT = { data: { id: 't1', name: 'Worth Properties' }, error: null };
const USER = { data: { name: 'Josh Bishop' }, error: null };
const DB_ERROR = { code: 'XX000', message: 'boom' };

describe('EZD-103a settings shell loader', () => {
  it('U3 (a) with settings_users: company, initials and the active-member head count', async () => {
    const { client, calls } = fakeClient({
      tenant: TENANT,
      app_user: USER,
      membership: { count: 4, error: null },
    });
    expect(await loadSettingsShellData(client, session, WITH_USERS)).toEqual({
      companyName: 'Worth Properties',
      initials: 'JB',
      activeMembers: 4,
    });
    expect(calls.membership).toContainEqual(['select', 'id', { count: 'exact', head: true }]);
    expect(calls.membership).toContainEqual(['eq', 'tenant_id', 't1']);
    expect(calls.membership).toContainEqual(['eq', 'status', 'active']);
    expect(calls.app_user).toContainEqual(['eq', 'id', 'u1']);
  });

  it('U3 (b) without settings_users: no count and no membership call', async () => {
    const { client, calls } = fakeClient({
      tenant: TENANT,
      app_user: USER,
      membership: { count: 4, error: null },
    });
    const data = await loadSettingsShellData(client, session, WITHOUT_USERS);
    expect(data).not.toBeNull();
    expect(data?.activeMembers).toBeNull();
    expect(calls.membership).toBeUndefined();
  });

  it('U3 (c) tenant error: null', async () => {
    const { client } = fakeClient({
      tenant: { data: null, error: DB_ERROR },
      app_user: USER,
      membership: { count: 4, error: null },
    });
    expect(await loadSettingsShellData(client, session, WITH_USERS)).toBeNull();
  });

  it('U3 (d) count error: null', async () => {
    const { client } = fakeClient({
      tenant: TENANT,
      app_user: USER,
      membership: { count: null, error: DB_ERROR },
    });
    expect(await loadSettingsShellData(client, session, WITH_USERS)).toBeNull();
  });

  it('U3 (e) tenant and user data null: empty company, email initial, no membership call', async () => {
    const { client, calls } = fakeClient({
      tenant: { data: null, error: null },
      app_user: { data: null, error: null },
      membership: { count: 4, error: null },
    });
    expect(await loadSettingsShellData(client, session, WITH_USERS)).toEqual({
      companyName: '',
      initials: 'J',
      activeMembers: null,
    });
    expect(calls.membership).toBeUndefined();
  });

  it('U3 (f) ctx null: no count and no membership call', async () => {
    const { client, calls } = fakeClient({
      tenant: TENANT,
      app_user: USER,
      membership: { count: 4, error: null },
    });
    const data = await loadSettingsShellData(client, session, null);
    expect(data).not.toBeNull();
    expect(data?.activeMembers).toBeNull();
    expect(calls.membership).toBeUndefined();
  });
});

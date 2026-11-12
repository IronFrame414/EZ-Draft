// EZD-104 U6 (vault/plans/EZD-104.md section 4; AC-EZD-104-7). Expected values: Decided "Where the touch
// runs": getPermissionContext runs current_permissions and touch_last_active once each on one session
// client, in parallel; a failing touch (error or throw) never changes the context; no session means null and
// no rpc. The fake client follows app/src/server/permissions/context.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  session: null as null | { appUserId: string },
  touch: 'error' as 'error' | 'throw',
}));
const rpc = vi.hoisted(() => vi.fn());
const createClient = vi.hoisted(() => vi.fn());

vi.mock('../auth/session', () => ({ getSession: async () => state.session }));
vi.mock('../auth/supabase-server', () => ({ createSessionClient: createClient }));
vi.mock('../errors/report', () => ({ reportError: vi.fn(async () => ({})) }));

const M = '11111111-1111-4111-8111-111111111111';
const ROW = {
  membership_id: M,
  project_scope: 'all',
  permission_keys: ['view_projects', 'settings_users'],
  listed_project_ids: [],
};

describe('EZD-104 getPermissionContext touches last active', () => {
  beforeEach(() => {
    vi.resetModules();
    rpc.mockReset();
    createClient.mockReset();
    createClient.mockImplementation(() => ({ rpc }));
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'current_permissions') return { data: [ROW], error: null };
      if (state.touch === 'throw') throw new Error('touch down');
      return { data: null, error: { code: 'XX000', message: 'internal' } };
    });
  });

  const expected = {
    appUserId: 'u1',
    membershipId: M,
    scope: 'all',
    permissions: new Set(['view_projects', 'settings_users']),
    listedProjectIds: new Set(),
  };

  it('U6 with a session: two rpc calls on one client, and the context is unchanged by a failing touch', async () => {
    for (const mode of ['error', 'throw'] as const) {
      vi.resetModules();
      rpc.mockClear();
      createClient.mockClear();
      state.session = { appUserId: 'u1' };
      state.touch = mode;
      const { getPermissionContext } = await import('./context');
      const ctx = await getPermissionContext();
      expect(ctx, mode).toEqual(expected);
      expect(rpc, mode).toHaveBeenCalledTimes(2);
      expect(rpc.mock.calls.map((c) => c[0]).sort(), mode).toEqual([
        'current_permissions',
        'touch_last_active',
      ]);
      expect(createClient, mode).toHaveBeenCalledTimes(1);
    }
  });

  it('U6 without a session: null and no rpc', async () => {
    state.session = null;
    const { getPermissionContext } = await import('./context');
    expect(await getPermissionContext()).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});

// EZD-102 U3 (vault/plans/EZD-102.md section 4). Expected values: Decided `loadPermissionContext` (one
// rpc('current_permissions'), no .from(); 42501 → null; other error → throw; 0 rows → null; keys filtered by
// isPermissionKey; scope = project_scope; arrays → sets) and Decided `permissionList` ([] for null, else the
// sorted keys). The client is a fake `{ rpc, from }`; no database.
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { loadPermissionContext, permissionList } from './index';

type RpcAnswer = { data: unknown; error: { code: string; message: string } | null };

function fakeClient(answer: RpcAnswer) {
  const rpc = vi.fn<(fn: string, args?: unknown) => Promise<RpcAnswer>>(async () => answer);
  const from = vi.fn();
  return { client: { rpc, from } as never, rpc, from };
}

describe('EZD-102 loadPermissionContext', () => {
  it('U3 load: one rpc, keys filtered, null without a row or on 42501, rejects otherwise', async () => {
    const M = randomUUID();
    const P = randomUUID();
    const appUserId = randomUUID();

    const ok = fakeClient({
      data: [
        {
          membership_id: M,
          project_scope: 'listed',
          permission_keys: ['edit_model', 'view_projects', 'bogus'],
          listed_project_ids: [P],
        },
      ],
      error: null,
    });
    const loaded = await loadPermissionContext(ok.client, appUserId);
    expect(ok.rpc).toHaveBeenCalledTimes(1);
    expect(ok.rpc.mock.calls[0]?.[0]).toBe('current_permissions');
    expect(ok.from).not.toHaveBeenCalled();
    expect(loaded).not.toBeNull();
    expect(loaded?.appUserId).toBe(appUserId);
    expect(loaded?.membershipId).toBe(M);
    expect(loaded?.scope).toBe('listed');
    expect([...(loaded?.permissions ?? [])].sort()).toEqual(['edit_model', 'view_projects']);
    expect([...(loaded?.listedProjectIds ?? [])]).toEqual([P]);
    expect(permissionList(loaded)).toEqual(['edit_model', 'view_projects']);

    const empty = fakeClient({ data: [], error: null });
    expect(await loadPermissionContext(empty.client, appUserId)).toBeNull();
    expect(empty.from).not.toHaveBeenCalled();

    const ended = fakeClient({ data: null, error: { code: '42501', message: 'session_ended' } });
    expect(await loadPermissionContext(ended.client, appUserId)).toBeNull();

    const broken = fakeClient({ data: null, error: { code: 'XX000', message: 'internal' } });
    await expect(loadPermissionContext(broken.client, appUserId)).rejects.toBeDefined();

    expect(permissionList(null)).toEqual([]);
  });
});

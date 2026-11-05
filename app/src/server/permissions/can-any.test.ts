// EZD-118 U3 (vault/plans/EZD-118.md section 4; AC-EZD-118-4, -9). Expected values: Decided "Any-of check"
// (requireApiPermission takes one key or a non-empty list; a list passes when the context holds any key; none
// gives the same 403 body; a refused session Response is returned as is; a single key behaves as before).
// Mocks as app/src/app/api/route-failure.test.ts:29-63 (state through vi.hoisted).
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { PermissionKey } from '../../lib/permissions/catalog';
import type { PermissionContext } from './context';

const state = vi.hoisted(() => ({
  requireApiSession: async (): Promise<unknown> => null,
  getPermissionContext: async (): Promise<unknown> => null,
}));

vi.mock('../auth/session', () => ({
  requireApiSession: () => state.requireApiSession(),
  getSession: async () => null,
  requireSession: async () => {
    throw new Error('requireSession is not used here');
  },
}));

vi.mock('./context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./context')>()),
  getPermissionContext: () => state.getPermissionContext(),
}));

import { requireApiPermission } from './can';

const SESSION = { authUserId: randomUUID(), appUserId: randomUUID(), email: 'ezd118@example.test' };
const ctxWith = (keys: Array<PermissionKey>): PermissionContext => ({
  appUserId: SESSION.appUserId,
  membershipId: randomUUID(),
  scope: 'all',
  permissions: new Set(keys),
  listedProjectIds: new Set<string>(),
});
const FORBIDDEN = { error: { code: 'permission_denied', message_key: 'error.not_authorized' } };

describe('EZD-118 requireApiPermission any-of', () => {
  it('U3 any-of: passes with one held key, refuses with none, returns the session refusal, single key unchanged', async () => {
    state.requireApiSession = async () => SESSION;
    const ctx = ctxWith(['create_projects']);
    state.getPermissionContext = async () => ctx;

    const ok = await requireApiPermission(['settings_company', 'create_projects']);
    expect(ok).not.toBeInstanceOf(Response);
    expect(ok).toEqual({ session: SESSION, ctx });

    const single = await requireApiPermission('create_projects');
    expect(single).toEqual({ session: SESSION, ctx });
    const singleRefused = await requireApiPermission('settings_company');
    expect(singleRefused).toBeInstanceOf(Response);
    expect((singleRefused as Response).status).toBe(403);
    expect(await (singleRefused as Response).json()).toEqual(FORBIDDEN);

    state.getPermissionContext = async () => ctxWith([]);
    const none = await requireApiPermission(['settings_company', 'create_projects']);
    expect(none).toBeInstanceOf(Response);
    expect((none as Response).status).toBe(403);
    expect(await (none as Response).json()).toEqual(FORBIDDEN);

    const refusal = Response.json({ error: { code: 'not_signed_in' } }, { status: 401 });
    state.requireApiSession = async () => refusal;
    const refused = await requireApiPermission(['settings_company', 'create_projects']);
    expect(refused).toBe(refusal);
    expect((refused as Response).status).toBe(401);
  });
});

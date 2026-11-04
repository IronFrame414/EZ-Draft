// EZD-102 U1, U2 (vault/plans/EZD-102.md section 4). Expected values: Decided `can` and `requirePermission`
// (key first, then project scope; Q-0202 own jobs = listed) and the section 3 response bodies with
// Cache-Control no-store. Imports from the section 3 export `app/src/server/permissions` (index.ts).
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { PermissionKey } from '../../lib/permissions/catalog';
import { can, requirePermission, type PermissionContext } from './index';

const P = randomUUID();
const Q = randomUUID();

function ctx(
  scope: 'all' | 'listed',
  permissions: PermissionKey[],
  listed: string[] = [],
): PermissionContext {
  return {
    appUserId: randomUUID(),
    membershipId: randomUUID(),
    scope,
    permissions: new Set(permissions),
    listedProjectIds: new Set(listed),
  };
}

async function expectError(
  res: Response | null,
  status: number,
  code: string,
  messageKey: string,
): Promise<void> {
  expect(res).toBeInstanceOf(Response);
  const r = res as Response;
  expect(r.status).toBe(status);
  expect(r.headers.get('cache-control') ?? '').toContain('no-store');
  expect(await r.json()).toEqual({ error: { code, message_key: messageKey } });
}

describe('EZD-102 can and requirePermission', () => {
  it('U1 can: null context, missing key, listed scope and all scope', () => {
    expect(can(null, 'view_projects')).toBe(false);

    const all = ctx('all', ['edit_model']);
    expect(can(all, 'edit_model')).toBe(true);
    expect(can(all, 'view_projects')).toBe(false);

    const listed = ctx('listed', ['view_projects'], [P]);
    expect(can(listed, 'view_projects', { projectId: P })).toBe(true);
    expect(can(listed, 'view_projects', { projectId: Q })).toBe(false);

    expect(can(all, 'edit_model', { projectId: Q })).toBe(true);
  });

  it('U2 requirePermission: 403 before 404, null when allowed', async () => {
    await expectError(
      requirePermission(ctx('all', ['view_projects']), 'edit_model'),
      403,
      'permission_denied',
      'error.not_authorized',
    );
    await expectError(
      requirePermission(ctx('listed', ['edit_model'], [P]), 'edit_model', { projectId: Q }),
      404,
      'project_not_found',
      'error.project_not_found',
    );
    expect(
      requirePermission(ctx('listed', ['edit_model'], [P]), 'edit_model', { projectId: P }),
    ).toBeNull();
    await expectError(
      requirePermission(null, 'edit_model'),
      403,
      'permission_denied',
      'error.not_authorized',
    );
  });
});

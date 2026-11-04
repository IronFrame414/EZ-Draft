// EZD-102 Step 6 (vault/plans/EZD-102.md): the one permission check (03b rule 1; ARCH can() contract).
// The key is checked first, then project scope, so a 403 says nothing about the project (Q-0202: a
// scoped user passes only for listed projects). requireApiPermission is the server-route order: session
// (401) → context → check; a thrown context load is the route's 500. Pattern: requireApiSession in
// app/src/server/auth/session.ts.
import type { PermissionKey } from '../../lib/permissions/catalog';
import { requireApiSession, type Session } from '../auth/session';
import { getPermissionContext, type PermissionContext } from './context';

export type Permitted = { session: Session; ctx: PermissionContext };

type Target = { projectId: string };

const headers = { 'Cache-Control': 'no-store' };

const permissionDenied = () =>
  Response.json(
    { error: { code: 'permission_denied', message_key: 'error.not_authorized' } },
    { status: 403, headers },
  );

const projectNotFound = () =>
  Response.json(
    { error: { code: 'project_not_found', message_key: 'error.project_not_found' } },
    { status: 404, headers },
  );

export function can(
  ctx: PermissionContext | null,
  permission: PermissionKey,
  target?: Target,
): boolean {
  if (ctx === null || !ctx.permissions.has(permission)) return false;
  if (target && ctx.scope === 'listed' && !ctx.listedProjectIds.has(target.projectId)) return false;
  return true;
}

export function requirePermission(
  ctx: PermissionContext | null,
  permission: PermissionKey,
  target?: Target,
): Response | null {
  if (ctx === null || !ctx.permissions.has(permission)) return permissionDenied();
  if (target && ctx.scope === 'listed' && !ctx.listedProjectIds.has(target.projectId)) {
    return projectNotFound();
  }
  return null;
}

export async function requireApiPermission(
  permission: PermissionKey,
  target?: Target,
): Promise<Permitted | Response> {
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const ctx = await getPermissionContext();
  if (ctx === null) return permissionDenied();
  const refused = requirePermission(ctx, permission, target);
  if (refused) return refused;
  return { session, ctx };
}

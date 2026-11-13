// EZD-107 (S15 Roles row, New role, Save as new role; Q-0695 decisions 10 row 59): GET lists the company's
// roles with their holder counts (presets Owner, Designer, Foreman, Crew, then custom roles by name); POST
// creates a custom role from { name, grantedKeys } and emits role.created (log_only) after the commit. Both
// need settings_users. Shared order and errors: server/roles/role-route.ts.
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { requireApiPermission } from '../../../../server/permissions';
import { headers, roleFail, runRoleWrite } from '../../../../server/roles/role-route';
import { createRole, listRoles, parseRoleInput } from '../../../../server/roles/roles';

export const dynamic = 'force-dynamic';

const ROUTE = '/api/settings/roles';

export async function GET(): Promise<Response> {
  try {
    const p = await requireApiPermission('settings_users');
    if (p instanceof Response) return p;
    const roles = await listRoles(createSessionClient());
    return Response.json({ roles }, { status: 200, headers });
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return roleFail(500, 'db_unavailable');
  }
}

export async function POST(request: Request): Promise<Response> {
  return runRoleWrite(
    ROUTE,
    null,
    () => requireApiPermission('settings_users'),
    async (client) => {
      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        return roleFail(400, 'invalid_input');
      }
      const input = parseRoleInput(raw);
      if (input === null) return roleFail(400, 'invalid_input');
      const r = await createRole(client, input);
      if (!r.ok) return r;
      const v = r.value;
      return {
        ok: true,
        status: 201,
        tenantId: v.tenantId,
        events: [{ name: 'role.created', payload: { roleId: v.roleId, name: v.name } }],
        body: {
          role: {
            id: v.roleId,
            name: v.name,
            preset: null,
            defaultPermissions: v.defaultPermissions ?? [],
            holders: 0,
          },
        },
      };
    },
  );
}

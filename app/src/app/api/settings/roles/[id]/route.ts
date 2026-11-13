// EZD-107 (S15 Role card; Q-0695 decisions 03 row 35, 10 row 59): PATCH renames and re-ticks one custom role
// (body { name, grantedKeys }; its holders keep their own switches) and emits role.updated when something
// changed; DELETE removes a custom role nobody holds and emits role.deleted. A preset is 409 role_preset; a
// held role 409 role_in_use. Shared order and errors: server/roles/role-route.ts.
import { requireApiPermission } from '../../../../../server/permissions';
import { roleFail, runRoleWrite } from '../../../../../server/roles/role-route';
import { deleteRole, parseRoleInput, updateRole } from '../../../../../server/roles/roles';

export const dynamic = 'force-dynamic';

const ROUTE = '/api/settings/roles/[id]';

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return runRoleWrite(
    ROUTE,
    ctx.params.then((p) => p.id),
    () => requireApiPermission('settings_users'),
    async (client, id) => {
      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        return roleFail(400, 'invalid_input');
      }
      const input = parseRoleInput(raw);
      if (input === null) return roleFail(400, 'invalid_input');
      const r = await updateRole(client, id, input);
      if (!r.ok) return r;
      const v = r.value;
      const fields = v.fields ?? [];
      return {
        ok: true,
        status: 200,
        tenantId: v.tenantId,
        events:
          fields.length > 0
            ? [{ name: 'role.updated', payload: { roleId: v.roleId, fields } }]
            : [],
        body: {
          role: {
            id: v.roleId,
            name: v.name,
            defaultPermissions: v.defaultPermissions ?? [],
          },
          fields,
        },
      };
    },
  );
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return runRoleWrite(
    ROUTE,
    ctx.params.then((p) => p.id),
    () => requireApiPermission('settings_users'),
    async (client, id) => {
      const r = await deleteRole(client, id);
      if (!r.ok) return r;
      const v = r.value;
      return {
        ok: true,
        status: 200,
        tenantId: v.tenantId,
        events: [{ name: 'role.deleted', payload: { roleId: v.roleId, name: v.name } }],
        body: { removed: true },
      };
    },
  );
}

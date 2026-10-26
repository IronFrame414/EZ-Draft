// EZD-112 Step 11 (vault/plans/EZD-112.md Decided "Save route", "Error bodies"; S15a Save, Events): save the
// company identity. Order: 401, 403 (no Company settings switch), 400 (body; a `set` logo that fails
// `checkLogoObject`), then the one write path `update_tenant_identity` under the member's session (it
// checks the switch again), then 200 with the saved company. `tenant.updated` is emitted only when something changed; a failed emit does not fail the save.
import { createSessionClient } from '../../../../server/auth/supabase-server';
import {
  checkLogoObject,
  currentTenantId,
  parseCompanyInput,
  toCompanyData,
} from '../../../../server/company/company';
import type { Database } from '../../../../server/db/database.types';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { emit } from '../../../../server/events';
import type { TenantField } from '../../../../lib/events/registry';
import { requireApiPermission } from '../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/settings/company';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

type Args = Database['public']['Functions']['update_tenant_identity']['Args'];

export async function PATCH(request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission('settings_company');
    if (p instanceof Response) return p;

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const parsed = parseCompanyInput(raw);
    if (!parsed.ok) return fail(400, parsed.code);
    const value = parsed.value;

    const client = createSessionClient();
    if (value.logo.action === 'set') {
      const tenantId = await currentTenantId(client);
      if (tenantId === null) return fail(400, 'invalid_input');
      // Decided "Logo object check": a hand-made PATCH never saves an unchecked file or a path with no
      // object; a refused object is removed.
      const check = await checkLogoObject(client, tenantId, value.logo.path);
      if (!check.ok) return fail(400, check.code);
    }

    // The generated Args type marks every argument non-null; the function takes null license and path.
    const args = {
      p_name: value.name,
      p_license_no: value.licenseNo,
      p_contact: value.contact,
      p_set_logo: value.logo.action !== 'keep',
      p_logo_path: value.logo.action === 'set' ? value.logo.path : null,
    } as unknown as Args;
    const { data, error } = await client.rpc('update_tenant_identity', args);
    if (error) {
      if (error.code === '42501') return fail(403, 'permission_denied', 'error.not_authorized');
      if (error.code === '22023') {
        return error.message.includes('company_name_required')
          ? fail(400, 'company_name_required')
          : fail(400, 'invalid_input');
      }
      throw error;
    }
    const row = data?.[0];
    if (!row) throw new Error('update_tenant_identity_no_row');

    if (row.changed.length > 0) {
      try {
        await emit(
          'tenant.updated',
          { fields: row.changed as TenantField[] },
          { tenantId: row.tenant_id, actorId: p.session.appUserId },
        );
      } catch {
        // The write is committed; a failed emit does not fail the save.
      }
    }

    const company = await toCompanyData(client, {
      name: row.tenant_name,
      logo_path: row.tenant_logo_path,
      license_no: row.tenant_license_no,
      contact: row.tenant_contact,
    });
    return Response.json({ company }, { status: 200, headers });
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

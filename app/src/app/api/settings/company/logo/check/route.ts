// EZD-112 Step 13 (vault/plans/EZD-112.md Decided "Check route", "Signed link"; AC-EZD-112-4, -5; Q-0232):
// check an uploaded logo's bytes. Order: 401, 403 (no Company settings switch), 400 (body, no company),
// then `checkLogoObject` (Decided "Logo object check"; its refusals are 400 with its code). A good logo
// answers its signed link (900 s).
import { z } from 'zod';
import { createSessionClient } from '../../../../../../server/auth/supabase-server';
import { checkLogoObject, currentTenantId } from '../../../../../../server/company/company';
import { reportRouteFailure } from '../../../../../../server/errors/route-failure';
import { requireApiPermission } from '../../../../../../server/permissions';
import { signedDownloadUrl } from '../../../../../../server/storage';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/settings/company/logo/check';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

const bodySchema = z.strictObject({ path: z.string().max(1000) });

export async function POST(request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission('settings_company');
    if (p instanceof Response) return p;

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) return fail(400, 'invalid_input');
    const path = parsed.data.path;

    const client = createSessionClient();
    const tenantId = await currentTenantId(client);
    if (tenantId === null) return fail(400, 'invalid_input');
    const check = await checkLogoObject(client, tenantId, path);
    if (!check.ok) return fail(400, check.code);
    const url = await signedDownloadUrl(client, { bucket: 'media', path });
    return Response.json({ logo: { path, url, kind: check.kind } }, { status: 200, headers });
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

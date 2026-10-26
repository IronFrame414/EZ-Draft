// EZD-112 Step 12 (vault/plans/EZD-112.md Decided "Upload route", "Logo path"; P132 step 8; Q-0266 (b)):
// sign a browser upload of a new company logo straight to Storage (11 Operations). Order: 401, 403 (no
// Company settings switch), 400 (body, file type, size), then a signed upload at a new path
// `<tenant_id>/tenant/logo/<uuid>.<kind>` in `media`. The bytes are checked by the check route.
import { z } from 'zod';
import { checkLogoFile, logoKindFromName } from '../../../../../lib/company/company';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { currentTenantId, logoPathFor } from '../../../../../server/company/company';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { requireApiPermission } from '../../../../../server/permissions';
import { createSignedUpload } from '../../../../../server/storage';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/settings/company/logo';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

const bodySchema = z.strictObject({
  fileName: z.string().max(255),
  size: z.number().int().min(0),
});

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
    const problem = checkLogoFile({ name: parsed.data.fileName, size: parsed.data.size });
    if (problem) return fail(400, problem);
    const kind = logoKindFromName(parsed.data.fileName);
    if (kind === null) return fail(400, 'logo_wrong_type');

    const client = createSessionClient();
    const tenantId = await currentTenantId(client);
    if (tenantId === null) throw new Error('tenant_not_found');
    const upload = await createSignedUpload(client, {
      bucket: 'media',
      path: logoPathFor(tenantId, kind),
    });
    return Response.json({ upload }, { status: 200, headers });
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

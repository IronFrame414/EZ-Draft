// EZD-295 (vault/plans/EZD-295.md D5-D8; Q-0478, Q-0512 (a)): the one way a company logo is stored. The body
// is the raw file bytes; the route checks and cleans them, then writes `<tenant_id>/tenant/logo/<uuid>.<kind>`
// in `media` as the signed-in member through the server (Storage refuses a write without the API gate
// header). Order: 401, 403 (no Company settings switch), 400 (type, size, bytes), 200 with the signed link.
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import {
  cleanLogo,
  currentTenantId,
  logoKindFromContentType,
  logoPathFor,
  readLogoBody,
} from '../../../../../server/company/company';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { requireApiPermission } from '../../../../../server/permissions';
import { signedDownloadUrl, uploadObject } from '../../../../../server/storage';
import { LOGO_CONTENT_TYPES, LOGO_MAX_BYTES } from '../../../../../lib/company/company';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/settings/company/logo';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function POST(request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission('settings_company');
    if (p instanceof Response) return p;

    const kind = logoKindFromContentType(request.headers.get('content-type'));
    if (kind === null) return fail(400, 'logo_wrong_type');
    const length = request.headers.get('content-length');
    if (length !== null && /^\d+$/.test(length.trim()) && Number(length) > LOGO_MAX_BYTES) {
      return fail(400, 'logo_too_large');
    }

    let body: Awaited<ReturnType<typeof readLogoBody>>;
    try {
      body = await readLogoBody(request.body);
    } catch {
      return fail(400, 'invalid_input');
    }
    if (!body.ok) return fail(400, body.code);
    const clean = cleanLogo(body.bytes, kind);
    if (!clean.ok) return fail(400, clean.code);

    const client = createSessionClient();
    const tenantId = await currentTenantId(client);
    if (tenantId === null) throw new Error('tenant_not_found');
    const path = logoPathFor(tenantId, kind);
    await uploadObject(client, { bucket: 'media', path }, clean.bytes, LOGO_CONTENT_TYPES[kind]);
    const url = await signedDownloadUrl(client, { bucket: 'media', path });
    return Response.json({ logo: { path, url, kind } }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

// EZD-140 Step 7 (vault/plans/EZD-140.md Decided D7; S15 line 17; Q-0393): read and save the signed-in
// user's own notification settings. Every signed-in user may (no permission switch). Order: 401, 403 (no
// company), 400 (body), then the read or save. The save's SQLSTATE maps 42501 to 403 and 22023 to 400; the
// PUT answers with the settings read again. No event.
import { requireApiSession } from '../../../../server/auth/session';
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { currentTenantId } from '../../../../server/company/company';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import {
  getMyNotificationSettings,
  saveMyNotificationSettings,
} from '../../../../server/notifications/settings';
import { parseNotificationSettingsInput } from '../../../../lib/notifications/settings';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/profile/notifications';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

const forbidden = () => fail(403, 'permission_denied', 'error.not_authorized');

export async function GET(): Promise<Response> {
  try {
    const session = await requireApiSession();
    if (session instanceof Response) return fail(401, 'not_signed_in');
    const client = createSessionClient();
    if ((await currentTenantId(client)) === null) return forbidden();
    const settings = await getMyNotificationSettings(client);
    return Response.json({ settings }, { status: 200, headers });
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const session = await requireApiSession();
    if (session instanceof Response) return fail(401, 'not_signed_in');
    const client = createSessionClient();
    if ((await currentTenantId(client)) === null) return forbidden();

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const parsed = parseNotificationSettingsInput(raw);
    if (!parsed.ok) return fail(400, 'invalid_input');

    try {
      await saveMyNotificationSettings(client, parsed.settings);
    } catch (e) {
      const code = (e as { code?: unknown }).code;
      if (code === '42501') return forbidden();
      if (code === '22023') return fail(400, 'invalid_input');
      throw e;
    }

    const settings = await getMyNotificationSettings(client);
    return Response.json({ settings }, { status: 200, headers });
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

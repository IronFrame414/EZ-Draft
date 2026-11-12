// EZD-135 Build step 13 (vault/plans/EZD-135.md Decided "Route order"; Q-0664; Q-0225; AC-EZD-135-1): one part of
// Settings → System status per request. Order: 401, 403 (no System status switch), 400 (query), then the part;
// 403 when the database function refuses; 500 db_unavailable.
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { requireApiPermission } from '../../../../server/permissions';
import { parseStatusQuery } from '../../../../lib/system-status/system-status';
import {
  loadBackupStatus,
  loadJobFailures,
  loadWebhookFailures,
} from '../../../../server/system-status/system-status';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/settings/system-status';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function GET(request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission('settings_system_status');
    if (p instanceof Response) return p;
    const query = parseStatusQuery(new URL(request.url).searchParams);
    if (query === null) return fail(400, 'invalid_input');
    const client = createSessionClient();
    if (query.part === 'jobs') {
      return Response.json(await loadJobFailures(client, query.page), { status: 200, headers });
    }
    if (query.part === 'webhooks') {
      return Response.json(await loadWebhookFailures(client, query.page), { status: 200, headers });
    }
    const result = await loadBackupStatus(client);
    if (!result.ok) return fail(403, 'permission_denied', 'error.not_authorized');
    return Response.json(result.status, { status: 200, headers });
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

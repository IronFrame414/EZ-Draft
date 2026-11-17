// EZD-110a Step 15 (vault/plans/EZD-110a.md Decided D8, D11; AC-EZD-110-3): mark all of the caller's unread
// notifications read. Order: 401, 403 (no View projects), then the function; 200 { marked: <count> }.
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { markAllNotificationsRead } from '../../../../server/notifications/notifications';
import { requireApiPermission } from '../../../../server/permissions';
import { endedSessionResponse } from '../../../../server/auth/ended-session';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/notifications/read-all';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Next passes the request; the route reads nothing from it
export async function POST(_request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    const marked = await markAllNotificationsRead(createSessionClient());
    return Response.json({ marked }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

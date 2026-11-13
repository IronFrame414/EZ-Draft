// EZD-104 Build step 6 (vault/plans/EZD-104.md Decided "Route"; S15 Controls; Q-0695 10 row 59): one page of
// the company's members and pending invites. Order: 401, 403 (no Users switch), 400 (query), then the
// session client (RLS: the claim tenant). Any throw is reported once and answers 500 db_unavailable.
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { requireApiPermission } from '../../../../server/permissions';
import { listUsers, parseUsersQuery } from '../../../../server/users/users';
import { endedSessionResponse } from '../../../../server/auth/ended-session';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/settings/users';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function GET(request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission('settings_users');
    if (p instanceof Response) return p;
    const query = parseUsersQuery(new URL(request.url).searchParams);
    if (query === null) return fail(400, 'invalid_input');
    const page = await listUsers(createSessionClient(), query);
    return Response.json(page, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

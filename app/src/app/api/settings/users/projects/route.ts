// EZD-129 (S15 Decision 13; board S15AccessPassword "Search projects"; Q-0695 decisions 10 row 59): the
// project choices of the Project access picker: { items: { id, name, address }[], more }, the first 50 by
// name. Order: 401, 403 (no settings_users), 400 (q over 200 characters), then the definer function under the
// session (it checks settings_users again). Any throw is reported once and answers 500 db_unavailable.
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { requireApiPermission } from '../../../../../server/permissions';
import { memberFail } from '../../../../../server/users/member-route';
import { listScopeProjects, parseScopeSearch } from '../../../../../server/users/scope';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/settings/users/projects';

export async function GET(request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission('settings_users');
    if (p instanceof Response) return p;
    const q = parseScopeSearch(new URL(request.url).searchParams);
    if (q === null) return memberFail(400, 'invalid_input');
    const r = await listScopeProjects(createSessionClient(), q);
    if (!r.ok) return memberFail(r.refusal.status, r.refusal.code);
    return Response.json(r.value, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return memberFail(500, 'db_unavailable');
  }
}

// EZD-128 Build step 5 (vault/plans/EZD-128.md section 3 route row; Decided "Recent route permission",
// "`exclude` query param"; Q-0697 decisions 04; Q-0698; Q-0726): the project switcher's recent projects, newest
// first, at most 8, the open project left out. Order: 401, 403 (no View projects), 400, then the session client
// (the definer function scopes every row to the caller's membership and project scope).
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { listRecentProjects, parseRecentQuery } from '../../../../server/projects/recent';
import { requireApiPermission } from '../../../../server/permissions';
import { endedSessionResponse } from '../../../../server/auth/ended-session';
import { RECENT_PROJECTS_MAX } from '../../../../lib/projects/recent';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/recent';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function GET(request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    const q = parseRecentQuery(new URL(request.url).searchParams);
    if (q === null) return fail(400, 'invalid_input');
    const items = await listRecentProjects(createSessionClient(), {
      limit: RECENT_PROJECTS_MAX,
      exclude: q.exclude,
    });
    return Response.json({ items }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

// EZD-117a Step 6 (vault/plans/EZD-117a.md Decided "Routes", "Query params"; S01 Controls, Data shown): one
// keyset page of 48 projects. Order: 401, 403 (no View projects), 400 for a malformed query, then the session
// client (RLS: the claim tenant and the viewer's scope).
// EZD-117b Build step 5 (vault/plans/EZD-117b.md Decided "Routes"): `q` is the search; over 1000 characters is 400.
import { createSessionClient } from '../../../server/auth/supabase-server';
import { reportRouteFailure } from '../../../server/errors/route-failure';
import { listProjects, parseProjectListQuery, parseProjectSearch } from '../../../server/projects/projects';
import { requireApiPermission } from '../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function GET(request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission('view_projects');
    // EZD-110a D8: no-store on every response, the guard's 401 included.
    if (p instanceof Response) {
      p.headers.set('Cache-Control', 'no-store');
      return p;
    }
    const params = new URL(request.url).searchParams;
    const query = parseProjectListQuery(params);
    if (query === null) return fail(400, 'invalid_input');
    const search = parseProjectSearch(params);
    if (search === null) return fail(400, 'invalid_input');
    const page = await listProjects(createSessionClient(), query, search);
    return Response.json(page, { status: 200, headers });
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

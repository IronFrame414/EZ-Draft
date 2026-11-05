// EZD-117a Step 7 (vault/plans/EZD-117a.md Decided "Routes"; S01 Controls; Q-0402): the status tab counts from
// one grouped count. Order: 401, 403 (no View projects), then the session client (RLS: the claim tenant and the
// viewer's scope).
// EZD-117b Build step 6 (vault/plans/EZD-117b.md Decided "Routes"; Q-0402): `q` narrows the counts; over 1000
// characters is 400.
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { countProjects, parseProjectSearch } from '../../../../server/projects/projects';
import { requireApiPermission } from '../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/counts';

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
    const search = parseProjectSearch(new URL(request.url).searchParams);
    if (search === null) return fail(400, 'invalid_input');
    const counts = await countProjects(createSessionClient(), search);
    return Response.json(counts, { status: 200, headers });
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

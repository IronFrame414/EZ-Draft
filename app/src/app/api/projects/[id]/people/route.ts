// EZD-126 (S06:81; AC-EZD-126-5; ARCH Realtime "Payload rule"): the names and initials of people in the project,
// for the presence avatars. Order as the model route: 401, 403 (no View projects), 404 (a malformed id or a
// project out of scope), 400 (`ids` missing, malformed or more than 20), then `readPeople` under the member's
// session (RLS). 200 `{ people }`; never an email.
import { z } from 'zod';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { parsePeopleIds, readPeople } from '../../../../../server/people/people';
import { requireApiPermission, requirePermission } from '../../../../../server/permissions';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/people';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'view_projects', { projectId: id });
    if (denied) return denied;
    const ids = parsePeopleIds(new URL(request.url).searchParams.get('ids'));
    if (ids === null) return fail(400, 'invalid_input');

    const people = await readPeople(createSessionClient(), id, ids);
    if (people === null) return fail(404, 'project_not_found');
    return Response.json({ people }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

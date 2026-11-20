// EZD-127 (04 Header card "N to review" pill; AC-EZD-127-1): one project's review summary for the editor's pill
// and review list. Order as the people route: 401, 403 (no View projects), 404 (a malformed id or a project out of
// scope), 400 (a `list` other than 1), then `readReviewSummary` under the member's session (RLS). 200
// `{ count }`, or `{ count, groups }` with `?list=1`. No money.
import { z } from 'zod';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { parseReviewQuery, readReviewSummary } from '../../../../../server/review/review';
import { requireApiPermission, requirePermission } from '../../../../../server/permissions';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/review';

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
    const q = parseReviewQuery(new URL(request.url).searchParams);
    if (q === null) return fail(400, 'invalid_input');

    const summary = await readReviewSummary(createSessionClient(), id, q.list);
    if (summary === null) return fail(404, 'project_not_found');
    return Response.json(summary, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

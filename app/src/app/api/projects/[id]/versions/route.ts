// EZD-122 (S20 Data shown, Permissions; Q-0700 10 "View projects: open the Versions panel"; AC-EZD-122-2, -9): the
// project's versions for the Versions panel, newest first. Order: 401, 403 (no View projects), 404 (a malformed id
// or a project out of scope), then `listVersions` under the member's session (RLS). 200 `{ versions }`; no
// model_json and no email.
import { z } from 'zod';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { requireApiPermission, requirePermission } from '../../../../../server/permissions';
import { listVersions } from '../../../../../server/versions/versions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/versions';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'view_projects', { projectId: id });
    if (denied) return denied;

    const versions = await listVersions(createSessionClient(), id);
    if (versions === null) return fail(404, 'project_not_found');
    return Response.json({ versions }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

// EZD-124 (S01 Card overflow menu, Validation; Q-0201; Q-0700 decisions 03 "Project Delete", 10; examples 09p
// Delete confirmation): Delete a project. Order: 401, 403 (no Delete projects), 404 (a malformed id or a project
// out of scope), 400 (bad JSON or body; a typed name that is not the project name, trimmed, case included), then
// delete_project through the session client, which removes the project and every dependent row, writes
// project.deleted and queues the company-level purge job in one transaction. The job runner is started after the
// response. 200 { deleted: true }.
import { z } from 'zod';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { kickJobRunner } from '../../../../../server/jobs/kick';
import { requireApiPermission } from '../../../../../server/permissions';
import { deleteProject, parseDeleteBody } from '../../../../../server/projects/project-card-actions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/delete';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('delete_projects', { projectId: id });
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const confirmName = parseDeleteBody(raw);
    if (confirmName === null) return fail(400, 'invalid_input');

    const result = await deleteProject(createSessionClient(), id, confirmName);
    if (!result.ok) {
      if (result.code === 'permission_denied')
        return fail(403, 'permission_denied', 'error.not_authorized');
      if (result.code === 'project_not_found') return fail(404, 'project_not_found');
      return fail(400, 'invalid_input');
    }
    kickJobRunner();
    return Response.json({ deleted: true }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

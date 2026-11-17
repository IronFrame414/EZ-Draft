// EZD-116 (Q-0697 decisions 03 "Defaults data"; AC-EZD-116-8): the effective defaults of one project for the
// open editor, re-read on the project channel resync. Order as the model load route: 401, 403 (no View
// projects), 404 (a malformed id or a project out of scope), then the project's copy over the company values
// over the registry defaults, read under the member's session (another company's project reads as none).
import { z } from 'zod';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { loadTenantDefaults, projectCopyOf } from '../../../../../server/defaults/defaults';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { requireApiPermission, requirePermission } from '../../../../../server/permissions';
import { effectiveDefaults } from '../../../../../lib/defaults/values';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/defaults';

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

    const client = createSessionClient();
    const [project, stored] = await Promise.all([
      client.from('project').select('settings').eq('id', id).maybeSingle(),
      loadTenantDefaults(client),
    ]);
    if (project.error) throw project.error;
    if (project.data === null) return fail(404, 'project_not_found');
    return Response.json(
      { defaults: effectiveDefaults(stored, projectCopyOf(project.data.settings)) },
      { status: 200, headers },
    );
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

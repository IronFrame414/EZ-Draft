// EZD-1404 (S17 Permissions "View field pack, all tabs ...: View projects (scoped to assigned projects)"; S17 Data
// shown; States "No set sent yet"): the project's issued field pack for the phone. Order as the field measure route:
// 401, 403, 404 (a malformed id or a project out of scope), then the session client. GET: 200 { projectName,
// clientName, pack }, pack null when no field pack has been issued yet. The phone stores this answer for offline use
// (lib/pwa/project-cache.ts). No money (S17 "Selected finishes (no prices)").
import { z } from 'zod';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { readFieldPack } from '../../../../../server/field-pack/read';
import { requireApiPermission, requirePermission } from '../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/field-pack';

const fail = (status: number, code: string) =>
  Response.json({ error: { code, message_key: `error.${code}` } }, { status, headers });

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'view_projects', { projectId: id });
    if (denied) return denied;
    const view = await readFieldPack(createSessionClient(), id);
    if (view === null) return fail(404, 'project_not_found');
    return Response.json(view, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

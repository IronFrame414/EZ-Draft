// EZD-117a Step 6 (vault/plans/EZD-117a.md Decided "Routes", "Query params"; S01 Controls, Data shown): one
// keyset page of 48 projects. Order: 401, 403 (no View projects), 400 for a malformed query, then the session
// client (RLS: the claim tenant and the viewer's scope).
// EZD-117b Build step 5 (vault/plans/EZD-117b.md Decided "Routes"): `q` is the search; over 1000 characters is 400.
// EZD-118 Build step 6 (vault/plans/EZD-118.md Decided "POST order"; Q-0413): New project. Order: 401, 403 (no
// Create projects), 400 for an unreadable or invalid body, then `create_project` through the session client;
// `project.created` is emitted after the write and a failed emit does not fail the create.
// EZD-301: a project started from a file sends `source: 'file'`, which project.created carries.
import { createSessionClient } from '../../../server/auth/supabase-server';
import { reportRouteFailure } from '../../../server/errors/route-failure';
import { emit } from '../../../server/events';
import {
  createProject,
  listProjects,
  parseNewProject,
  parseProjectListQuery,
  parseProjectSearch,
} from '../../../server/projects/projects';
import { requireApiPermission } from '../../../server/permissions';
import { endedSessionResponse } from '../../../server/auth/ended-session';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function GET(request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    const params = new URL(request.url).searchParams;
    const query = parseProjectListQuery(params);
    if (query === null) return fail(400, 'invalid_input');
    const search = parseProjectSearch(params);
    if (search === null) return fail(400, 'invalid_input');
    const page = await listProjects(createSessionClient(), query, search);
    return Response.json(page, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission('create_projects');
    if (p instanceof Response) return p;
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const values = parseNewProject(raw);
    if (values === null) return fail(400, 'invalid_input');
    const result = await createProject(createSessionClient(), values);
    if (!result.ok) {
      if (result.code === 'permission_denied') {
        return fail(403, 'permission_denied', 'error.not_authorized');
      }
      if (result.code === 'customer_unavailable') {
        return fail(400, 'customer_unavailable', 'error.project_customer_unavailable');
      }
      if (result.code === 'foreman_unavailable') return fail(400, 'foreman_unavailable');
      return fail(400, 'invalid_input');
    }
    const { projectId, tenantId } = result;
    try {
      await emit(
        'project.created',
        { projectId, source: values.source ?? 'standalone' },
        { tenantId, projectId, actorId: p.session.appUserId },
      );
    } catch {
      // The project is committed; a failed emit does not fail the create (Decided "POST order").
    }
    return Response.json({ project: { id: projectId } }, { status: 201, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

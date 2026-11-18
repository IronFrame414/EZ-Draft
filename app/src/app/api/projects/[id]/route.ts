// EZD-124 (S01 Card overflow menu; Q-0199; Q-0201; Q-0202; Q-0700 decisions 10 "Phase 9 action and permission
// table"): the card menu's Rename, Set status, Archive and Restore. Order: 401, 403 (neither Edit model nor Delete
// projects), 404 (a malformed id or a project out of scope), 400 (bad JSON or body), 403 for the switch this
// change needs (Rename and Set status: Edit model; Archive and Restore: Delete projects), then the definer
// function through the session client, which checks all of it again and writes the event_log row.
// Body: exactly one of { name }, { status } or { archived }. 200 { changed }.
import { z } from 'zod';
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { requireApiPermission, requirePermission } from '../../../../server/permissions';
import { applyCardChange, parseCardChange } from '../../../../server/projects/project-card-actions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission(['edit_model', 'delete_projects'], { projectId: id });
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const change = parseCardChange(raw);
    if (change === null) return fail(400, 'invalid_input');
    const needed =
      change.kind === 'rename' || change.kind === 'status' ? 'edit_model' : 'delete_projects';
    const denied = requirePermission(p.ctx, needed, { projectId: id });
    if (denied) return denied;

    const result = await applyCardChange(createSessionClient(), id, change);
    if (!result.ok) {
      if (result.code === 'permission_denied')
        return fail(403, 'permission_denied', 'error.not_authorized');
      if (result.code === 'project_not_found') return fail(404, 'project_not_found');
      return fail(400, 'invalid_input');
    }
    return Response.json({ changed: result.changed }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

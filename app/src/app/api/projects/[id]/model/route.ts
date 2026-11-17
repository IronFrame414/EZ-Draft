// EZD-120b Build step 10 (vault/plans/EZD-120b.md Decided "Load route"; section 3 route row; AC-EZD-120b-5):
// the project and its working copy for the editor. Order (as EZD-120a's Route order, with View projects): 401,
// 403 (no View projects switch), 404 (a malformed id or a project out of scope), then `loadModel` under the
// member's session (RLS: another company's project reads as none, so it is the same 404). 200 `ModelLoad`.
// EZD-128 Build step 6 (vault/plans/EZD-128.md Decided "Record at load"; Q-0697 decisions 04): a load that found
// the model records the open for the project switcher's recent list, on the same session client, before the 200;
// a failed record is reported as project_open_record_failed and the load still answers 200.
import { z } from 'zod';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { errorType } from '../../../../../server/errors/fingerprint';
import { reportError } from '../../../../../server/errors/report';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { recordProjectOpen } from '../../../../../server/projects/recent';
import { loadModel } from '../../../../../server/model/model';
import { requireApiPermission, requirePermission } from '../../../../../server/permissions';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/model';
const RECORD_FAILED = 'project_open_record_failed';

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
    const model = await loadModel(client, id, p.ctx);
    if (model === null) return fail(404, 'project_not_found');
    // EZD-128: a recent list is not worth a failed open.
    try {
      await recordProjectOpen(client, id);
    } catch (e) {
      try {
        await reportError(new Error(RECORD_FAILED), {
          source: 'function',
          location: ROUTE,
          tags: { 'ezd.cause': errorType(e) },
        });
      } catch {
        /* reportError never throws; guarded as route-failure.ts does */
      }
    }
    return Response.json(model, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

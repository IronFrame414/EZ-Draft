// EZD-120b Build step 10 (vault/plans/EZD-120b.md Decided "Load route"; section 3 route row; AC-EZD-120b-5):
// the project and its working copy for the editor. Order (as EZD-120a's Route order, with View projects): 401,
// 403 (no View projects switch), 404 (a malformed id or a project out of scope), then `loadModel` under the
// member's session (RLS: another company's project reads as none, so it is the same 404). 200 `ModelLoad`.
import { z } from 'zod';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { loadModel } from '../../../../../server/model/model';
import { requireApiPermission, requirePermission } from '../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/model';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) {
      p.headers.set('Cache-Control', 'no-store');
      return p;
    }
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'view_projects', { projectId: id });
    if (denied) return denied;

    const model = await loadModel(createSessionClient(), id, p.ctx);
    if (model === null) return fail(404, 'project_not_found');
    return Response.json(model, { status: 200, headers });
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

// EZD-236 Build step 8 (vault/plans/EZD-236.md section 1 Decided "Route order", "Request body", "Who",
// "Production"; section 3 route row; Q-0211; AC-EZD-236-2): make the company's benchmark project, or return the
// one it has. Order: 401, 403 without System status, 403 without Edit model, 403 when the database refuses,
// else 201 (made now) or 200 (already there) { project: { id } }. The request body is never read.
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { ensureBenchmarkProject } from '../../../../server/benchmark/benchmark-project';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { requireApiPermission, requirePermission } from '../../../../server/permissions';
import { endedSessionResponse } from '../../../../server/auth/ended-session';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/benchmark/project';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function POST(_request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission('settings_system_status');
    if (p instanceof Response) {
      p.headers.set('Cache-Control', 'no-store');
      return p;
    }
    const denied = requirePermission(p.ctx, 'edit_model');
    if (denied !== null) return denied;
    const result = await ensureBenchmarkProject(createSessionClient());
    if (!result.ok) return fail(403, 'permission_denied', 'error.not_authorized');
    return Response.json(
      { project: { id: result.projectId } },
      { status: result.created ? 201 : 200, headers },
    );
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

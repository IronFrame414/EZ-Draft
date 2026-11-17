// EZD-214 (03 Q-0664 "View default"; AC-EZD-214-1, -7; the EZD-219 plan-scale route's order): set the
// project's phase view. Order: 401, 404 (a malformed id), 403 / 404 (no Edit model switch, project out of scope),
// 400 (bad JSON or a body that is not exactly `{ phase: 'existing' | 'proposed' }`), then `set_phase_default`
// under the member's session (it checks the switch and scope again). 200 `{ phase }`. The edit lock check joins when the lock ticket lands.
import { z } from 'zod';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { setPhaseDefault } from '../../../../../server/model/model';
import { requireApiPermission, requirePermission } from '../../../../../server/permissions';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/phase-default';

const bodySchema = z.object({ phase: z.enum(['existing', 'proposed']) }).strict();

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('edit_model');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'edit_model', { projectId: id });
    if (denied) return denied;

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const body = bodySchema.safeParse(raw);
    if (!body.success) return fail(400, 'invalid_input');

    const result = await setPhaseDefault(createSessionClient(), id, body.data.phase);
    if (!result.ok) {
      if (result.code === 'permission_denied')
        return fail(403, 'permission_denied', 'error.not_authorized');
      if (result.code === 'invalid_input') return fail(400, 'invalid_input');
      return fail(404, 'project_not_found');
    }
    return Response.json({ phase: body.data.phase }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

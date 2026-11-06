// EZD-120a Build step 8 (vault/plans/EZD-120a.md Decided "Route order", "Error mapping"; section 3;
// AC-EZD-120a-4, -5): make a checkpoint of the project's working copy. Order: 401, 403 (no Edit model switch),
// 404 (a malformed id or a project out of scope), then `create_checkpoint` under the member's session (it
// checks the switch and scope again). 201 `{ version: { id } }`.
import { z } from 'zod';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { createCheckpoint } from '../../../../../server/model/model';
import { requireApiPermission, requirePermission } from '../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/checkpoints';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('edit_model');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'edit_model', { projectId: id });
    if (denied) return denied;

    const result = await createCheckpoint(createSessionClient(), id);
    if (!result.ok) {
      if (result.code === 'permission_denied')
        return fail(403, 'permission_denied', 'error.not_authorized');
      return fail(404, 'project_not_found');
    }
    return Response.json({ version: { id: result.versionId } }, { status: 201, headers });
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

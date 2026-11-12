// EZD-224 Build step 7 (vault/plans/EZD-224.md Decided "Route order"; Seam): complete of a plan thumbnail.
import { z } from 'zod';
import { createSessionClient } from '../../../../../../../../server/auth/supabase-server';
import { reportRouteFailure } from '../../../../../../../../server/errors/route-failure';
import { requireApiPermission, requirePermission } from '../../../../../../../../server/permissions';
import { completeCheckpointThumbnail } from '../../../../../../../../server/thumbnail/thumbnail';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/versions/[versionId]/thumbnail/complete';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
): Promise<Response> {
  try {
    const { id, versionId } = await params;
    const p = await requireApiPermission('edit_model');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    if (!z.uuid().safeParse(versionId).success) return fail(404, 'version_not_found');
    const denied = requirePermission(p.ctx, 'edit_model', { projectId: id });
    if (denied) return denied;

    const result = await completeCheckpointThumbnail(createSessionClient(), id, versionId);
    if (!result.ok) {
      if (result.code === 'permission_denied')
        return fail(403, 'permission_denied', 'error.not_authorized');
      if (result.code === 'thumbnail_invalid') return fail(409, 'thumbnail_invalid');
      return fail(404, result.code);
    }
    return Response.json(
      { thumbnail: { versionId: versionId.toLowerCase() } },
      { status: 200, headers },
    );
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

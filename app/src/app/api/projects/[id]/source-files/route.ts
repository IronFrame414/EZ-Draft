// EZD-301 (S01 Start from a file flow; S02 Entry; Q-0517): start one original's upload to a project. The row comes
// first and the browser then sends the bytes straight to Storage with the signed upload (EZD-132). Order: 401,
// 403 without Edit model, 404 for a malformed project id, 403 when the project is outside the caller's scope, 400
// for an unreadable body, then the helper (403 for a cost file without See company costs, 400 for its input
// codes); any other failure is 500 after reportRouteFailure.
import { z } from 'zod';
import { SOURCE_FILE_KINDS } from '../../../../../lib/storage/source-file-kinds';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { requireApiPermission, requirePermission } from '../../../../../server/permissions';
import { startSourceFileUpload, StorageError } from '../../../../../server/storage';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/source-files';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

const bodySchema = z.strictObject({
  kind: z.enum(SOURCE_FILE_KINDS),
  originalName: z.string(),
  contentType: z.string(),
  size: z.number(),
});

const INPUT_CODES = new Set(['invalid_input', 'project_not_found', 'upload_refused']);

export async function POST(
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
    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return fail(400, 'invalid_input');
    try {
      const { sourceFile, upload } = await startSourceFileUpload(createSessionClient(), {
        ...body.data,
        projectId: id,
        uploadedBy: p.session.appUserId,
      });
      return Response.json({ sourceFile, upload }, { status: 201, headers });
    } catch (e) {
      if (e instanceof StorageError && e.code === 'permission_denied') {
        return fail(403, 'permission_denied', 'error.not_authorized');
      }
      if (e instanceof StorageError && INPUT_CODES.has(e.code)) {
        return fail(400, e.code, 'error.invalid_input');
      }
      throw e;
    }
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

// EZD-606 (S06 Controls "Existing panel ... panel label photo (AI reads brand, rating, spaces; user confirms),
// existing circuit list (typed or read from directory photo; user confirms) ... Edit model"): starts a panel photo
// read. JSON `{ fileId, read }`, `read` "label" or "directory", the file a completed panel_photo upload of this
// project. Order: 401, 403 without Edit model, 404 for a malformed project id or one outside the caller's scope, 400 for an unreadable body, 404 file_not_found, then 202 `{ jobId }` (follow it on the project
// channel and at /api/jobs/[id]); any other failure is 500 after reportRouteFailure.
import { z } from 'zod';
import { PANEL_READS } from '../../../../../lib/electrical/panel-read';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { startPanelRead } from '../../../../../server/jobs/ai-purposes/panel-read-start';
import { requireApiPermission, requirePermission } from '../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/panel-read';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

const bodySchema = z.strictObject({ fileId: z.uuid(), read: z.enum(PANEL_READS) });

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
    const started = await startPanelRead(
      createSessionClient(),
      id,
      body.data.fileId,
      body.data.read,
    );
    if ('refused' in started) return fail(404, 'file_not_found');
    return Response.json({ jobId: started.jobId }, { status: 202, headers });
  } catch (e) {
    if (e !== null && typeof e === 'object' && (e as { code?: unknown }).code === '42501') {
      const ended = await endedSessionResponse(e);
      return ended ?? fail(403, 'permission_denied', 'error.not_authorized');
    }
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

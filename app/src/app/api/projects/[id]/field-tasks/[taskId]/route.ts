// EZD-1409 (S17 Task row "edit text: Edits the task text. Edit field tasks; online only"): PATCH { text } → 200
// { textEn, textEs, editedAt }. The text is written in the caller's interface language. Order: 401, 403 without Edit
// field tasks, 404 for a malformed id or a project out of scope, 400 for an unreadable body or text that is empty
// or over 1000 characters, 404 task_not_found for no published or done task of that id in the project, then 500.
import { z } from 'zod';
import { createSessionClient } from '../../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../../server/errors/route-failure';
import { editBodySchema, editFieldTask, TASK_TEXT_MAX } from '../../../../../../server/field-tasks/edit';
import { requireApiPermission, requirePermission } from '../../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/field-tasks/[taskId]';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

type Ctx = { params: Promise<{ id: string; taskId: string }> };

export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id, taskId } = await params;
    const p = await requireApiPermission('edit_field_tasks');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'edit_field_tasks', { projectId: id });
    if (denied) return denied;
    if (!z.uuid().safeParse(taskId).success) return fail(404, 'task_not_found');
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const body = editBodySchema.safeParse(raw);
    if (!body.success) return fail(400, 'invalid_input');
    const text = body.data.text.trim();
    if (text.length === 0 || text.length > TASK_TEXT_MAX) return fail(400, 'invalid_input');

    const r = await editFieldTask(createSessionClient(), id, taskId, text);
    if (!r.ok) {
      if (r.code === 'permission_denied') return fail(403, 'permission_denied', 'error.not_authorized');
      if (r.code === 'project_not_found') return fail(404, 'project_not_found');
      if (r.code === 'task_not_found') return fail(404, 'task_not_found');
      return fail(400, 'invalid_input');
    }
    return Response.json(
      { textEn: r.textEn, textEs: r.textEs, editedAt: r.editedAt },
      { status: 200, headers },
    );
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

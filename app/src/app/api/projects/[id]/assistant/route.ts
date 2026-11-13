// EZD-5602 Build step 12 (vault/plans/EZD-5602.md Decided "D-Route"; section 3 route row; Q-0637 call path;
// AC-EZD-5602-2): POST one Assistant prompt. Order: 401, 403 (no Edit model switch), 404 (a malformed id or a
// project out of scope), the multipart body (400), then runAssistantPrompt under the member's session, which ends
// the provider call when the browser goes away (request.signal). Every answer is no-store JSON. No maxDuration:
// the default 300 s covers the 120 s call budget.
import { z } from 'zod';
import { readAssistantBody, runAssistantPrompt } from '../../../../../server/assistant/assistant';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { requireApiPermission, requirePermission } from '../../../../../server/permissions';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/assistant';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

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

    const body = await readAssistantBody(request);
    if (!body.ok) {
      return fail(
        400,
        body.code,
        body.code === 'photo_unreadable'
          ? 'error.assistant_photo_unreadable'
          : `error.${body.code}`,
      );
    }

    const answer = await runAssistantPrompt(createSessionClient(), p.ctx, id, body.input, {
      signal: request.signal,
      photo: body.photo,
    });
    return Response.json(answer.body, { status: answer.status, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

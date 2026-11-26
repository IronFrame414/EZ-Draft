// EZD-111 (vault/plans/EZD-111.md P111 RT2, D-Route order, D-Note, D-Recipient; Q-0700; AC-EZD-111-2 to -6):
// send the project to its client. Order: 401, 403 (no Send to client), 404 (a malformed id or a project out of
// scope), 400 (body), then sendToClient under the member's session (send_to_client checks the switch and scope
// again). The body has `note` and (EZD-719) the optional `set`; any other key, a recipient included, is ignored. 201 `{ send }`, whose link
// is the Copy link and is in no log.
import { z } from 'zod';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { requireApiPermission, requirePermission } from '../../../../../server/permissions';
import { sendToClient } from '../../../../../server/sends/sends';
import { SEND_NOTE_MAX } from '../../../../../lib/sends/sends';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/sends';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

// EZD-719: `set` is the Sheets screen's chosen set (kind, and the sheet_set object id or null for the default).
const bodySchema = z.object({
  note: z.string().max(SEND_NOTE_MAX).nullable().optional(),
  set: z.object({ kind: z.enum(['permit', 'client']), id: z.uuid().nullable() }).nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('send_to_client');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'send_to_client', { projectId: id });
    if (denied) return denied;

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) return fail(400, 'invalid_input');

    const result = await sendToClient(createSessionClient(), {
      projectId: id,
      note: parsed.data.note ?? null,
      set: parsed.data.set ?? null,
    });
    if (!result.ok) {
      if (result.code === 'permission_denied')
        return fail(403, 'permission_denied', 'error.not_authorized');
      if (result.code === 'no_client') return fail(400, 'no_client', 'error.send_no_client');
      if (result.code === 'invalid_input') return fail(400, 'invalid_input');
      return fail(404, 'project_not_found');
    }
    return Response.json({ send: result.send }, { status: 201, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

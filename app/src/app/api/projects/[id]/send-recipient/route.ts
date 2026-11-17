// EZD-111 (vault/plans/EZD-111.md P111 RT1, D-Route order; Q-0700): the Send dialog's To line, the project's
// client read on the server. Order: 401, 403 (no Send to client), 404 (a malformed id or a project out of scope),
// then the read under the member's session. 200 `{ recipient: { name, email } | null }`.
import { z } from 'zod';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { requireApiPermission, requirePermission } from '../../../../../server/permissions';
import { readSendRecipient } from '../../../../../server/sends/sends';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/send-recipient';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('send_to_client');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'send_to_client', { projectId: id });
    if (denied) return denied;

    const result = await readSendRecipient(createSessionClient(), id);
    if (!result.ok) return fail(404, 'project_not_found');
    return Response.json({ recipient: result.recipient }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

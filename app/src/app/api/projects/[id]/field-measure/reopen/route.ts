// EZD-1419 (S17b States "sent (read-only until reopened by office)"; vault/build/assumptions.md EZD-1419): the office
// reopens the project's sent field measure rooms. Order as the field measure route: 401, 403 (no Approve field
// measurements), 404 (a malformed id or a project out of scope), then the session client. POST: 200
// { status: 'reopened' }, or { status: 'not_sent' } when nothing was sent.
import { z } from 'zod';
import { createSessionClient } from '../../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../../server/errors/route-failure';
import {
  FieldMeasureError,
  reopenFieldMeasure,
} from '../../../../../../server/field-measure/session';
import { requireApiPermission, requirePermission } from '../../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/field-measure/reopen';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('approve_field_measurements');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'approve_field_measurements', { projectId: id });
    if (denied) return denied;
    try {
      const status = await reopenFieldMeasure(createSessionClient(), id);
      return Response.json({ status }, { status: 200, headers });
    } catch (e) {
      if (!(e instanceof FieldMeasureError)) throw e;
      if (e.code === 'not_found') return fail(404, 'project_not_found');
      return fail(403, 'permission_denied', 'error.not_authorized');
    }
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

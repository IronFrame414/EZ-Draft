// EZD-1422 (Q-0204 "'Waiting for field measurements', who it was sent to and a Resend button; it never expires. The
// sender or anyone who can edit the project can cancel it."): the project card's Resend (POST) and Cancel (DELETE) of
// the wizard's field measure request. Order: 401, 403 (no View projects), 404 (a malformed id), then the definer function under the session
// client, which decides the rest: 403 (neither the sender nor Edit model), 404 (out of scope), 409 not_waiting (no
// waiting request), 409 foreman_unavailable (Resend to a Foreman no longer active). POST answers 200 { sentTo, link,
// emailSent }; DELETE 200 { status: 'cancelled' }.
import { z } from 'zod';
import { createSessionClient } from '../../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../../server/errors/route-failure';
import {
  cancelFieldMeasure,
  resendFieldMeasure,
} from '../../../../../../server/field-measure/request';
import { requireApiPermission, requirePermission } from '../../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/field-measure/request';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

type Ctx = { params: Promise<{ id: string }> };

async function failed(e: unknown): Promise<Response> {
  const ended = await endedSessionResponse(e);
  if (ended) return ended;
  await reportRouteFailure(e, ROUTE);
  return fail(500, 'db_unavailable');
}

function refused(code: string): Response {
  if (code === 'permission_denied') return fail(403, 'permission_denied', 'error.not_authorized');
  if (code === 'project_not_found') return fail(404, 'project_not_found');
  return fail(409, code, 'office.projects.menu.failed');
}

export async function POST(_request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'view_projects', { projectId: id });
    if (denied) return denied;
    const r = await resendFieldMeasure(createSessionClient(), id);
    if (!r.ok) return refused(r.code);
    return Response.json(r.request, { status: 200, headers });
  } catch (e) {
    return failed(e);
  }
}

export async function DELETE(_request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'view_projects', { projectId: id });
    if (denied) return denied;
    const r = await cancelFieldMeasure(createSessionClient(), id);
    if (!r.ok) return refused(r.code);
    return Response.json({ status: 'cancelled' }, { status: 200, headers });
  } catch (e) {
    return failed(e);
  }
}

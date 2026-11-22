// EZD-1415 (S17b Field measure; Permissions "Send field measurement to create and send; View projects to view"):
// the project's field measure rooms. Order as the project notes route: 401, 403, 404 (a malformed id or a project
// out of scope), then the session client. GET (View projects): 200 { rooms }. PUT (Send field measurement):
// { rooms } replaces the stored rooms; 400 for a body that is not a room list, 200 { status: 'saved' }.
// EZD-1419: 409 field_measure_sent while the rooms are sent (read-only until the office reopens them).
import { z } from 'zod';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import {
  FieldMeasureError,
  readFieldMeasure,
  saveFieldMeasure,
} from '../../../../../server/field-measure/session';
import { requireApiPermission, requirePermission } from '../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/field-measure';
// The database refuses a room list over 256 KB (field_measure_session.rooms).
const MAX_BODY_CHARS = 262144;

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

type Ctx = { params: Promise<{ id: string }> };

async function failed(e: unknown): Promise<Response> {
  const ended = await endedSessionResponse(e);
  if (ended) return ended;
  await reportRouteFailure(e, ROUTE);
  return fail(500, 'db_unavailable');
}

export async function GET(_request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'view_projects', { projectId: id });
    if (denied) return denied;
    const view = await readFieldMeasure(createSessionClient(), id);
    if (view === null) return fail(404, 'project_not_found');
    return Response.json({ rooms: view.rooms }, { status: 200, headers });
  } catch (e) {
    return failed(e);
  }
}

export async function PUT(request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('send_field_measurement');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'send_field_measurement', { projectId: id });
    if (denied) return denied;
    const text = await request.text();
    if (text.length > MAX_BODY_CHARS) return fail(400, 'invalid_input');
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return fail(400, 'invalid_input');
    }
    const rooms = (raw as { rooms?: unknown } | null)?.rooms;
    try {
      await saveFieldMeasure(createSessionClient(), id, rooms);
    } catch (e) {
      if (!(e instanceof FieldMeasureError)) throw e;
      if (e.code === 'not_found') return fail(404, 'project_not_found');
      if (e.code === 'invalid_input') return fail(400, 'invalid_input');
      if (e.code === 'sent') return fail(409, 'field_measure_sent');
      return fail(403, 'permission_denied', 'error.not_authorized');
    }
    return Response.json({ status: 'saved' }, { status: 200, headers });
  } catch (e) {
    return failed(e);
  }
}

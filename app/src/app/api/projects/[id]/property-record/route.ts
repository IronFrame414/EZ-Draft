// EZD-711 (S13 Controls "Property appraiser import ... Edit model"; S13 Decision 9; S01 Property appraiser link "user
// confirms each field ... Year built before 1978 sets the lead flag"; AC-EZD-711-1, -2): a project's property record.
// GET: 401, 403 (no View projects), 404 (a malformed id, out of scope or not visible), 200 `{ record }` with the
// lead flag. PUT: 401, 404 (a malformed id), 403 / 404 (no Edit model, project out of scope), 400 (bad JSON or a body
// that is not exactly `{ fields, sourceUrl }`), then set_property_record under the member's session (it checks the
// switch and scope again); 200 `{ record }`. property_record.imported is emitted after the write; a failed emit does
// not fail the save.
import { z } from 'zod';
import { confirmedRecordSchema, isPre1978 } from '../../../../../lib/property-record/property-record';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { emit } from '../../../../../server/events';
import { requireApiPermission, requirePermission } from '../../../../../server/permissions';
import {
  loadProjectPropertyRecord,
  saveProjectPropertyRecord,
} from '../../../../../server/property-record/record';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/property-record';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'view_projects', { projectId: id });
    if (denied) return denied;
    const record = await loadProjectPropertyRecord(createSessionClient(), id);
    if (record === null) return fail(404, 'project_not_found');
    return Response.json({ record }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

export async function PUT(request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('edit_model');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'edit_model', { projectId: id });
    if (denied) return denied;

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const body = confirmedRecordSchema.safeParse(raw);
    if (!body.success) return fail(400, 'invalid_input');

    const client = createSessionClient();
    const result = await saveProjectPropertyRecord(client, id, body.data);
    if (!result.ok) {
      if (result.code === 'permission_denied') return fail(403, 'permission_denied', 'error.not_authorized');
      if (result.code === 'invalid_input') return fail(400, 'invalid_input');
      return fail(404, 'project_not_found');
    }
    try {
      await emit(
        'property_record.imported',
        { projectId: id, recordId: result.recordId, fields: result.fields, leadFlag: result.leadFlag },
        { tenantId: result.tenantId, projectId: id, actorId: p.session.appUserId },
      );
    } catch {
      // The record is committed; a failed emit does not fail the save.
    }
    const f = body.data.fields;
    return Response.json(
      { record: { fields: f, sourceUrl: body.data.sourceUrl, leadFlag: isPre1978(f.yearBuilt) } },
      { status: 200, headers },
    );
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

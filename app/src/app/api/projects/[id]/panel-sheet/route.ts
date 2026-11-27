// EZD-708c (S06 Events emitted "sheet.updated (new) on Add to E2.0"; S06 Permissions "Add to E2.0: Edit model"):
// log that Add to E2.0 (or Update) placed a panel's schedule and load calc on the panel sheet. The placement itself is
// a model edit saved with the model (sheet_set `panelSheets`); this route only writes the event. Order as the
// plan-scale route: 401, 404 (a malformed id), 403 / 404 (no Edit model switch, project out of scope), 400 (bad JSON
// or a body that is not exactly `{ sheet, panelId }`), 404 (a project the session cannot read), then sheet.updated.
// 204 with no body.
import { z } from 'zod';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { emit } from '../../../../../server/events';
import { requireApiPermission, requirePermission } from '../../../../../server/permissions';
import { panelSheetProjectTenant } from '../../../../../server/sheets/panel-sheet';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/panel-sheet';

// An electrical sheet number (E2.0, E3.0 ...), as lib/sheets/electrical-kinds.ts reads one.
const bodySchema = z
  .object({ sheet: z.string().regex(/^E[1-9]\d{0,2}\.0$/), panelId: z.uuid() })
  .strict();

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

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const body = bodySchema.safeParse(raw);
    if (!body.success) return fail(400, 'invalid_input');

    const tenantId = await panelSheetProjectTenant(createSessionClient(), id);
    if (tenantId === null) return fail(404, 'project_not_found');
    await emit('sheet.updated', body.data, { tenantId, projectId: id, actorId: p.session.appUserId });
    return new Response(null, { status: 204, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

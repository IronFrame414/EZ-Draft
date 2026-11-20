// EZD-122 (S20 "Name snapshot"; Q-0700 10 "Edit model: Name snapshot (no lock)"; Q-0700 05 "trimmed and non-empty,
// no maximum"; S20 Events emitted; AC-EZD-122-4): names a working version, which becomes a named snapshot. Order:
// 401, 403 (no Edit model switch), 404 (a malformed id or a project out of scope), 400 (bad JSON, or an empty name),
// then `name_snapshot` under the member's session (it checks the switch and scope again). 200
// `{ version: { id, label } }`; 404 for a version that is not this project's; 409 `version_not_working` for a sent
// version or one already named. `version.snapshot_named` is emitted after the write; a failed emit is reported and
// does not fail the write (as the objects route).
import { z } from 'zod';
import { createSessionClient } from '../../../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../../../server/auth/ended-session';
import { errorType } from '../../../../../../../server/errors/fingerprint';
import { reportError } from '../../../../../../../server/errors/report';
import { reportRouteFailure } from '../../../../../../../server/errors/route-failure';
import { emit } from '../../../../../../../server/events';
import { requireApiPermission, requirePermission } from '../../../../../../../server/permissions';
import { nameSnapshot, snapshotBodySchema } from '../../../../../../../server/versions/versions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/versions/[versionId]/snapshot';
const EMIT_FAILED = 'version_snapshot_named_event_failed';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
): Promise<Response> {
  try {
    const { id, versionId } = await params;
    const p = await requireApiPermission('edit_model');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'edit_model', { projectId: id });
    if (denied) return denied;
    if (!z.uuid().safeParse(versionId).success) return fail(404, 'version_not_found');

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const body = snapshotBodySchema.safeParse(raw);
    if (!body.success) return fail(400, 'invalid_input');

    const result = await nameSnapshot(createSessionClient(), id, versionId, body.data.name);
    if (!result.ok) {
      switch (result.code) {
        case 'permission_denied':
          return fail(403, 'permission_denied', 'error.not_authorized');
        case 'project_not_found':
          return fail(404, 'project_not_found');
        case 'version_not_found':
          return fail(404, 'version_not_found');
        case 'invalid_input':
          return fail(400, 'invalid_input');
        case 'not_working':
          return fail(409, 'version_not_working');
      }
    }

    try {
      await emit(
        'version.snapshot_named',
        { modelVersionId: result.id },
        { tenantId: result.tenantId, projectId: id, actorId: p.session.appUserId },
      );
    } catch (e) {
      try {
        await reportError(new Error(EMIT_FAILED), {
          source: 'function',
          location: ROUTE,
          tags: { 'ezd.cause': errorType(e) },
        });
      } catch {
        /* reportError never throws; guarded as route-failure.ts does */
      }
    }
    return Response.json(
      { version: { id: result.id, label: result.label } },
      { status: 200, headers },
    );
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

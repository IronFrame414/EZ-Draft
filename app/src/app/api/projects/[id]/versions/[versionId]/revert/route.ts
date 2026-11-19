// EZD-122 (S20 "Revert"; Q-0700 03 "Revert", 10 "Edit model and the lock: Revert"; 03b rule 5; S20 Events emitted;
// AC-EZD-122-1, -5): replaces the working copy with the chosen version. Order: 401, 403 (no Edit model switch), 404
// (a malformed id or a project out of scope), 400 (bad JSON or body), then `revertToVersion` under the member's
// session: it reads the version, migrates and validates its objects (400 `invalid_object` when any fails) and calls
// `revert_to_version`, which checks the switch, scope, holder and lock generation again (409 `stale_lock_epoch`).
// 200 `{ version: { id } }`, the new working version. `version.reverted` is emitted after the write; a failed emit
// is reported and does not fail the revert.
import { z } from 'zod';
import { createSessionClient } from '../../../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../../../server/auth/ended-session';
import { errorType } from '../../../../../../../server/errors/fingerprint';
import { reportError } from '../../../../../../../server/errors/report';
import { reportRouteFailure } from '../../../../../../../server/errors/route-failure';
import { emit } from '../../../../../../../server/events';
import { requireApiPermission, requirePermission } from '../../../../../../../server/permissions';
import { revertBodySchema, revertToVersion } from '../../../../../../../server/versions/versions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/versions/[versionId]/revert';
const EMIT_FAILED = 'version_reverted_event_failed';

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
    const body = revertBodySchema.safeParse(raw);
    if (!body.success) return fail(400, 'invalid_input');

    const result = await revertToVersion(createSessionClient(), id, versionId, body.data);
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
        case 'invalid_object':
          return Response.json(
            {
              error: { code: 'invalid_object', message_key: 'error.invalid_input' },
              invalid: result.invalid,
            },
            { status: 400, headers },
          );
        case 'stale_lock_epoch':
          return fail(409, 'stale_lock_epoch', 'error.stale_lock_epoch');
      }
    }

    try {
      await emit(
        'version.reverted',
        { modelVersionId: result.versionId, fromVersionId: versionId },
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
    return Response.json({ version: { id: result.versionId } }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

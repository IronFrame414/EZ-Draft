// EZD-123 (S20 Cleanup sheet; Q-0700 05 "Cleanup sheet", 10 "Edit model and the lock: ... cleanup Save choices";
// AC-EZD-123-2, -5, -6, -9, -10): the cleanup sheet's read and its Save choices.
// GET: Edit model (users without it never see the sheet). Order: 401, 403, 404 (a malformed id or a project out of
// scope), then the read under the member's session. 200 `{ rows, graceDays, ageDays }`, rows newest first.
// POST: Edit model and the lock. Order: 401, 403, 404, 400 (bad JSON or body), then save_cleanup_choices under the
// member's session (it checks the switch, scope and lock again). 200 `{ kept, deleted }`; 409 `stale_lock_epoch` when
// the caller does not hold the lock. Kept rows emit version.snapshot_named; the function writes cleanup.deleted.
import { z } from 'zod';
import { createSessionClient } from '../../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../../server/auth/ended-session';
import { errorType } from '../../../../../../server/errors/fingerprint';
import { reportError } from '../../../../../../server/errors/report';
import { reportRouteFailure } from '../../../../../../server/errors/route-failure';
import { emit } from '../../../../../../server/events';
import { requireApiPermission, requirePermission } from '../../../../../../server/permissions';
import {
  cleanupBodySchema,
  listCleanup,
  saveCleanupChoices,
} from '../../../../../../server/versions/cleanup';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/versions/cleanup';
const EMIT_FAILED = 'version_snapshot_named_event_failed';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('edit_model');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'edit_model', { projectId: id });
    if (denied) return denied;

    const list = await listCleanup(createSessionClient(), id);
    if (list === null) return fail(404, 'project_not_found');
    return Response.json(list, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

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
    const body = cleanupBodySchema.safeParse(raw);
    if (!body.success) return fail(400, 'invalid_input');

    const result = await saveCleanupChoices(createSessionClient(), id, body.data);
    if (!result.ok) {
      switch (result.code) {
        case 'permission_denied':
          return fail(403, 'permission_denied', 'error.not_authorized');
        case 'project_not_found':
          return fail(404, 'project_not_found');
        case 'invalid_input':
          return fail(400, 'invalid_input');
        case 'stale_lock_epoch':
          return fail(409, 'stale_lock_epoch');
      }
    }

    for (const modelVersionId of result.kept) {
      try {
        await emit(
          'version.snapshot_named',
          { modelVersionId },
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
    }
    return Response.json({ kept: result.kept, deleted: result.deleted }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

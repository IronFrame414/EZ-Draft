// EZD-313 (S02 Controls Finish import "Writes accepted items to the model as a new model version; opens 03 Plan";
// Permissions "Edit model: required for every accept, fix, delete, typed measurement and Finish import"; Events
// emitted import.completed, model.saved on Finish import, room.closure_overridden; AC-EZD-313-2): Finish import.
// Order, as the review's PATCH: 401, 403 without Edit model, 404 for a malformed id, 403 for a project outside the
// member's list, then finishImport (server/imports/finish-import.ts): 404 not this project's import, 403 refused,
// 409 import_not_ready while detection runs or failed, 409 import_unresolved while an item or a room gap is
// unresolved, 409 lock_held when another user holds the edit lock, 409 import_closed after Finish or Cancel, 400
// an item that cannot become a valid object, else 200 with the model version and the counts imported. After the
// write commits: import.completed, model.saved with the new object ids, then one room.closure_overridden per room
// kept out of square; a failed emit is reported and does not fail the Finish.
// EZD-916 (vault/build/assumptions.md EZD-916): an import of order reports alone writes order lines and no model
// version (modelVersionId null), so it emits neither import.completed (whose payload names the version) nor
// model.saved; the answer also gives the number of order lines written.
import { z } from 'zod';
import { createSessionClient } from '../../../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../../../server/auth/ended-session';
import { errorType } from '../../../../../../../server/errors/fingerprint';
import { reportError } from '../../../../../../../server/errors/report';
import { reportRouteFailure } from '../../../../../../../server/errors/route-failure';
import { emit } from '../../../../../../../server/events';
import { finishImport, ImportCloseError } from '../../../../../../../server/imports/finish-import';
import { requireApiPermission, requirePermission } from '../../../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/imports/[jobId]/finish';
const EMIT_FAILED = 'import_completed_event_failed';

const fail = (status: number, code: string, key: string) =>
  Response.json({ error: { code, message_key: key } }, { status, headers });
const notFound = () => fail(404, 'import_not_found', 'error.import_not_found');

async function emitted(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
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

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; jobId: string }> },
): Promise<Response> {
  try {
    const p = await requireApiPermission('edit_model');
    if (p instanceof Response) return p;
    const { id, jobId } = await params;
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(jobId).success) return notFound();
    const denied = requirePermission(p.ctx, 'edit_model', { projectId: id });
    if (denied) return denied;
    let result;
    try {
      result = await finishImport(createSessionClient(), id, jobId, p.session.appUserId);
    } catch (e) {
      if (!(e instanceof ImportCloseError)) throw e;
      if (e.code === 'not_found') return notFound();
      if (e.code === 'invalid_input') return fail(400, 'invalid_input', 'error.invalid_input');
      return fail(403, 'permission_denied', 'error.not_authorized');
    }
    switch (result.status) {
      case 'not_found':
        return notFound();
      case 'not_ready':
        return fail(409, 'import_not_ready', 'error.import_not_ready');
      case 'unresolved':
        return fail(409, 'import_unresolved', 'error.import_unresolved');
      case 'locked':
        return fail(409, 'lock_held', 'error.lock_held');
      case 'closed':
        return fail(409, 'import_closed', 'error.import_closed');
      case 'invalid':
        return fail(400, 'invalid_input', 'error.invalid_input');
    }
    const ctx = { tenantId: result.tenantId, projectId: id, actorId: p.session.appUserId };
    const modelVersionId = result.modelVersionId;
    if (modelVersionId !== null) {
      await emitted(() =>
        emit(
          'import.completed',
          {
            projectId: id,
            sourceFileIds: result.sourceFileIds,
            counts: result.counts,
            modelVersionId,
          },
          ctx,
        ),
      );
      await emitted(() => emit('model.saved', { objectIds: result.objectIds }, ctx));
    }
    for (const o of result.overridden) {
      await emitted(() =>
        emit(
          'room.closure_overridden',
          { roomId: o.roomId, gapIn: o.gapIn, userId: p.session.appUserId },
          ctx,
        ),
      );
    }
    return Response.json(
      {
        status: 'finished',
        modelVersionId: result.modelVersionId,
        counts: result.counts,
        imported: result.imported,
        orderLines: result.orderLines,
      },
      { status: 200, headers },
    );
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable', 'error.db_unavailable');
  }
}

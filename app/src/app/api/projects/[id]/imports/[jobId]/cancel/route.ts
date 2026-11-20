// EZD-313 (S02 Controls Cancel import "discards detected items. Uploaded source files are kept", "No model changes
// are made"; Events emitted import.cancelled; Q-0215; AC-EZD-313-1): Cancel import, after the page has asked to
// confirm. Edit model is required, as for every other review change (vault/build/assumptions.md EZD-313). Order:
// 401, 403 without Edit model, 404 for a malformed id, 403 for a project outside the member's list, then
// cancel_import: 404 not this project's import, 403 refused, 409 lock_held when another user holds the edit lock,
// 409 import_closed after Finish or Cancel, else 200. After the write commits import.cancelled is emitted; a failed
// emit is reported and does not fail the Cancel.
import { z } from 'zod';
import { createSessionClient } from '../../../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../../../server/auth/ended-session';
import { errorType } from '../../../../../../../server/errors/fingerprint';
import { reportError } from '../../../../../../../server/errors/report';
import { reportRouteFailure } from '../../../../../../../server/errors/route-failure';
import { emit } from '../../../../../../../server/events';
import { cancelImport } from '../../../../../../../server/imports/cancel-import';
import { ImportCloseError } from '../../../../../../../server/imports/finish-import';
import { requireApiPermission, requirePermission } from '../../../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/imports/[jobId]/cancel';
const EMIT_FAILED = 'import_cancelled_event_failed';

const fail = (status: number, code: string, key: string) =>
  Response.json({ error: { code, message_key: key } }, { status, headers });
const notFound = () => fail(404, 'import_not_found', 'error.import_not_found');

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
      result = await cancelImport(createSessionClient(), id, jobId);
    } catch (e) {
      if (!(e instanceof ImportCloseError)) throw e;
      if (e.code === 'not_found') return notFound();
      if (e.code === 'invalid_input') return fail(400, 'invalid_input', 'error.invalid_input');
      return fail(403, 'permission_denied', 'error.not_authorized');
    }
    if (result.status === 'locked') return fail(409, 'lock_held', 'error.lock_held');
    if (result.status !== 'cancelled') return fail(409, 'import_closed', 'error.import_closed');
    const tenantId = result.tenantId;
    try {
      await emit(
        'import.cancelled',
        { projectId: id, jobId },
        { tenantId, projectId: id, actorId: p.session.appUserId },
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
    return Response.json({ status: 'cancelled' }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable', 'error.db_unavailable');
  }
}

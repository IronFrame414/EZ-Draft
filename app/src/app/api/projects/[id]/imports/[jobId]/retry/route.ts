// EZD-314 (S02 States "Error: import job failed: message with file name and Retry; Cancel import stays available";
// AC-EZD-314-2): Retry of a failed import. Edit model is required, as for Cancel import (vault/build/assumptions.md
// EZD-314). Order: 401, 403 without Edit model, 404 for a malformed id, 403 for a project outside the member's list,
// then retry_import: 404 not this project's import, 403 refused, 409 lock_held when another user holds the edit
// lock, 409 import_closed after Finish or Cancel, 409 import_not_failed when the import is detecting or has not
// failed, else 200 with the job back on the queue and the runner started.
import { z } from 'zod';
import { createSessionClient } from '../../../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../../../server/errors/route-failure';
import { retryImport, ReviewSaveError } from '../../../../../../../server/imports/review';
import { kickJobRunner } from '../../../../../../../server/jobs/kick';
import { requireApiPermission, requirePermission } from '../../../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/imports/[jobId]/retry';

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
      result = await retryImport(createSessionClient(), id, jobId);
    } catch (e) {
      if (!(e instanceof ReviewSaveError)) throw e;
      if (e.code === 'not_found') return notFound();
      return fail(403, 'permission_denied', 'error.not_authorized');
    }
    if (result === 'locked') return fail(409, 'lock_held', 'error.lock_held');
    if (result === 'closed') return fail(409, 'import_closed', 'error.import_closed');
    if (result !== 'queued') return fail(409, 'import_not_failed', 'error.import_not_failed');
    kickJobRunner();
    return Response.json({ status: 'queued' }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable', 'error.db_unavailable');
  }
}

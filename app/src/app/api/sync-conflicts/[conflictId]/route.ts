// EZD-299a Build step 12 (vault/plans/EZD-299a.md section 3 delete route row; Decided D-Delete, D-Errors;
// Q-0540; AC-EZD-299-11): remove one of the caller's refused changes (Remove on the list). Order: 401/403
// without View projects, 404 for a malformed id, then `delete_my_sync_conflict` under the member's session
// (only the caller's own row; no scope check, so a row of a project no longer open can go); no row is 404.
import { z } from 'zod';
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { deleteConflict } from '../../../../server/conflicts/conflicts';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { requireApiPermission } from '../../../../server/permissions';
import { endedSessionResponse } from '../../../../server/auth/ended-session';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/sync-conflicts/[conflictId]';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

const rpcCode = (e: unknown): string | undefined =>
  typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string'
    ? e.code
    : undefined;

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ conflictId: string }> },
): Promise<Response> {
  try {
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    const { conflictId } = await params;
    if (!z.uuid().safeParse(conflictId).success) return fail(404, 'sync_conflict_not_found');
    let removed: boolean;
    try {
      removed = await deleteConflict(createSessionClient(), conflictId);
    } catch (e) {
      if (rpcCode(e) === '42501') return fail(403, 'permission_denied', 'error.not_authorized');
      throw e;
    }
    if (!removed) return fail(404, 'sync_conflict_not_found');
    return Response.json({ removed: true }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

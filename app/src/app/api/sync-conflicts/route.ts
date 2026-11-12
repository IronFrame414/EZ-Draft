// EZD-299a Build step 11 (vault/plans/EZD-299a.md section 3 list route row; Decided D-Read, D-Reason, D-Saved
// by, D-Errors; Q-0540; Q-0628; Q-0632 (a); AC-EZD-299-11, -13): the caller's refused changes, every project,
// newest first. Order: 401/403 without View projects, then `list_my_sync_conflicts` under the member's session.
import { createSessionClient } from '../../../server/auth/supabase-server';
import { listConflicts } from '../../../server/conflicts/conflicts';
import { reportRouteFailure } from '../../../server/errors/route-failure';
import { requireApiPermission } from '../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/sync-conflicts';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

const rpcCode = (e: unknown): string | undefined =>
  typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string'
    ? e.code
    : undefined;

export async function GET(_request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    let items;
    try {
      items = await listConflicts(createSessionClient());
    } catch (e) {
      if (rpcCode(e) === '42501') return fail(403, 'permission_denied', 'error.not_authorized');
      throw e;
    }
    return Response.json({ items }, { status: 200, headers });
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

// EZD-102 Step 8 (vault/plans/EZD-102.md): the signed-in member's own permission set, fetched by the
// browser only after user_permission.updated or a Realtime resync (AC-EZD-102-4; 11 rule 11). No can():
// a member may always read their own set; [] without an active membership. Pattern:
// app/src/app/api/jobs/[id]/route.ts.
import { requireApiSession } from '../../../server/auth/session';
import { reportError } from '../../../server/errors/report';
import { getPermissionContext, permissionList } from '../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };

// A failed session read or database error (Q-0168 (b); architecture Errors and logging).
const dbUnavailable = () =>
  Response.json(
    { error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } },
    { status: 500, headers },
  );

export async function GET(): Promise<Response> {
  try {
    const s = await requireApiSession();
    if (s instanceof Response) return s;
    const ctx = await getPermissionContext();
    return Response.json({ permissions: permissionList(ctx) }, { status: 200, headers });
  } catch (e) {
    await reportError(e, { source: 'function', location: 'api.permissions' });
    return dbUnavailable();
  }
}

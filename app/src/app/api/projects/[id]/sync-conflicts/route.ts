// EZD-299a Build step 10 (vault/plans/EZD-299a.md section 3 record route row; Decided D-Membership, D-Record
// scope, D-Cap, D-Fit, D-Label source, D-Notify, D-Errors; Q-0531; Q-0540; AC-EZD-299-13, -15): keep the changes
// the server refused for the caller, and send them one notification naming the project and every object. Order:
// a membership header that is not the session's 401, 401/403 without View projects, 404 for a malformed id or a
// project out of scope, 400 for bad JSON or body, then the labels and `record_sync_conflicts` under the member's
// session (it checks the scope again). 201 `{ ids, notificationId }`; the job runner is kicked when a
// notification was made.
import { z } from 'zod';
import { MEMBERSHIP_HEADER } from '../../../../../lib/outbox/outbox';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import {
  fitConflictNames,
  labelsFor,
  parseRecordRequest,
  recordConflicts,
} from '../../../../../server/conflicts/conflicts';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { kickJobRunner } from '../../../../../server/jobs/kick';
import {
  getPermissionContext,
  requireApiPermission,
  requirePermission,
} from '../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/sync-conflicts';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

const rpcCode = (e: unknown): string | undefined =>
  typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string'
    ? e.code
    : undefined;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const ctx = await getPermissionContext();
    if (ctx !== null && request.headers.get(MEMBERSHIP_HEADER) !== ctx.membershipId) {
      return fail(401, 'not_signed_in');
    }
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    if (requirePermission(p.ctx, 'view_projects', { projectId: id }) !== null) {
      return fail(404, 'project_not_found');
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const req = parseRecordRequest(raw);
    if (req === null) return fail(400, 'invalid_input');

    const client = createSessionClient();
    const labels = await labelsFor(client, id, req.changes);
    let recorded: { ids: string[]; notificationId: string | null };
    try {
      recorded = await recordConflicts(client, id, req, fitConflictNames(labels));
    } catch (e) {
      switch (rpcCode(e)) {
        case '42501':
          return fail(403, 'permission_denied', 'error.not_authorized');
        case 'P0002':
          return fail(404, 'project_not_found');
        case '22023':
          return fail(400, 'invalid_input');
        default:
          throw e;
      }
    }

    if (recorded.notificationId !== null) kickJobRunner();
    return Response.json(recorded, { status: 201, headers });
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

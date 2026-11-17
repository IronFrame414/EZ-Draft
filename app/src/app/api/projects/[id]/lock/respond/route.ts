// EZD-125 (S06:21, 76, Decision 5; Q-0697 decisions 03, 10; AC-EZD-125-6, -10): the holder's answer to a
// request. Body `{ requestId, response: 'release' | 'keep' }`. Keep: the lock stays and the requester may ask
// again at once; Release: a server checkpoint, then the release (reason request_accepted). The holder only:
// anyone else is 409 `not_lock_holder`; a request no longer pending (a Keep after the deadline lost to the
// auto release) is 409 `request_not_pending`. 200 `{ status: 'kept' | 'released', lock: { lockEpoch } }`.
import { z } from 'zod';
import { createSessionClient } from '../../../../../../server/auth/supabase-server';
import { eventLogIp } from '../../../../../../server/events/event-log';
import { respondRequest } from '../../../../../../server/lock/lock';
import {
  failedResponse,
  fail,
  isProjectId,
  ok,
  readBody,
  refusedResponse,
} from '../../../../../../server/lock/lock-route';
import { requireApiPermission, requirePermission } from '../../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const ROUTE = '/api/projects/[id]/lock/respond';

const respondBody = z.strictObject({
  requestId: z.uuid(),
  response: z.enum(['release', 'keep']),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    if (!isProjectId(id)) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'view_projects', { projectId: id });
    if (denied) return denied;
    const body = await readBody(request, respondBody);
    if (body === null) return fail(400, 'invalid_input');

    const result = await respondRequest(
      createSessionClient(),
      id,
      body.requestId,
      body.response,
      eventLogIp(request.headers),
    );
    if (!result.ok) return refusedResponse(result.code);
    if (result.status === 'not_holder') return fail(409, 'not_lock_holder');
    if (result.status === 'not_pending') return fail(409, 'request_not_pending');
    return ok({ status: result.status, lock: { lockEpoch: result.lockEpoch } });
  } catch (e) {
    return failedResponse(e, ROUTE);
  }
}

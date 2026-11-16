// EZD-125 (S06 Decision 12; Q-0697 decisions 04, 10; AC-EZD-125-6, -8, -10): the holder's release. Body
// `{ reason: 'stop_editing' | 'closed', lockEpoch? }`: Stop editing (the browser drained and made its
// checkpoint first) or a tab close (a server checkpoint first; carries the lock_epoch it held). The holder
// only: anyone else is 409 `not_lock_holder`; a tab close whose epoch moved is 409 `stale_lock_epoch`.
// View projects is enough to reach it (a holder whose Edit model was switched off can still let go).
import { z } from 'zod';
import { createSessionClient } from '../../../../../../server/auth/supabase-server';
import { eventLogIp } from '../../../../../../server/events/event-log';
import { releaseLock } from '../../../../../../server/lock/lock';
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

const ROUTE = '/api/projects/[id]/lock/release';

const releaseBody = z.strictObject({
  reason: z.enum(['stop_editing', 'closed']),
  lockEpoch: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
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
    const body = await readBody(request, releaseBody);
    if (body === null) return fail(400, 'invalid_input');

    const result = await releaseLock(
      createSessionClient(),
      id,
      body.reason,
      body.lockEpoch ?? null,
      eventLogIp(request.headers),
    );
    if (!result.ok) return refusedResponse(result.code);
    if (result.status === 'not_holder') return fail(409, 'not_lock_holder');
    if (result.status === 'stale_lock_epoch') return fail(409, 'stale_lock_epoch');
    return ok({ lock: { lockEpoch: result.lockEpoch } });
  } catch (e) {
    return failedResponse(e, ROUTE);
  }
}

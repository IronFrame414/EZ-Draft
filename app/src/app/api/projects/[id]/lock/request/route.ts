// EZD-125 (S06:20, 75; Q-0697 decisions 03 "Auto release", decisions 10; S15d:45; Q-0188; AC-EZD-125-5,
// -7): Request edit and Cancel request. POST (Edit model): the deadline is now plus the company's effective
// "Edit lock auto-release" minutes read here, at request time (the one registry gives the default); 201
// `{ request: { id, requestedAt, deadlineAt } }`; 200 `{ lockFree: true }` when the lock is free; 409 `own_lock`
// for the holder and `request_pending` for a second pending request. DELETE (View projects): the caller's own
// pending request ends; 200 `{ request: { id } }`, 404 `request_not_found` when there is none.
import { createSessionClient } from '../../../../../../server/auth/supabase-server';
import { loadTenantDefaults } from '../../../../../../server/defaults/defaults';
import { eventLogIp } from '../../../../../../server/events/event-log';
import { autoReleaseMinutes, cancelRequest, requestEdit } from '../../../../../../server/lock/lock';
import {
  failedResponse,
  fail,
  isProjectId,
  ok,
  refusedResponse,
} from '../../../../../../server/lock/lock-route';
import { requireApiPermission, requirePermission } from '../../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const ROUTE = '/api/projects/[id]/lock/request';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('edit_model');
    if (p instanceof Response) return p;
    if (!isProjectId(id)) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'edit_model', { projectId: id });
    if (denied) return denied;

    const client = createSessionClient();
    const minutes = autoReleaseMinutes(await loadTenantDefaults(client));
    const result = await requestEdit(client, id, minutes, eventLogIp(request.headers));
    if (!result.ok) return refusedResponse(result.code);
    if (result.status === 'lock_free') return ok({ lockFree: true });
    if (result.status === 'own_lock') return fail(409, 'own_lock');
    if (result.status === 'already_requested') return fail(409, 'request_pending');
    return ok(
      {
        request: {
          id: result.requestId,
          requestedAt: result.requestedAt,
          deadlineAt: result.deadlineAt,
        },
      },
      201,
    );
  } catch (e) {
    return failedResponse(e, ROUTE);
  }
}

export async function DELETE(
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

    const result = await cancelRequest(createSessionClient(), id, eventLogIp(request.headers));
    if (!result.ok) return refusedResponse(result.code);
    if (result.status === 'no_request') return fail(404, 'request_not_found');
    return ok({ request: { id: result.requestId } });
  } catch (e) {
    return failedResponse(e, ROUTE);
  }
}

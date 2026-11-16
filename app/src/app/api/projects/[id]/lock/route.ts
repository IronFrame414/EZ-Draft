// EZD-125 (S06 Edit lock; Q-0697 decisions 03, 10; 04:90; S03:16-17; AC-EZD-125-2, -4): the project's edit
// lock. GET (View projects): the lock read, which applies an expired request first; 200 `{ lock }` with the
// holder's name (scope-checked here, never in a broadcast). POST (Edit model): Start editing, and the editor's
// open; body `{ deviceId? }`; 200 `{ lock: { lockEpoch, since } }` when the caller holds it (a second tab keeps
// the epoch), 409 `lock_held` with `{ holder: { appUserId, name }, since }` when another person does.
import { z } from 'zod';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { eventLogIp } from '../../../../../server/events/event-log';
import { acquireLock, readLock } from '../../../../../server/lock/lock';
import {
  LOCK_HEADERS,
  failedResponse,
  fail,
  isProjectId,
  ok,
  readBody,
  refusedResponse,
} from '../../../../../server/lock/lock-route';
import { requireApiPermission, requirePermission } from '../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const ROUTE = '/api/projects/[id]/lock';

const acquireBody = z.strictObject({ deviceId: z.string().min(1).max(100).optional() });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    if (!isProjectId(id)) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'view_projects', { projectId: id });
    if (denied) return denied;

    const result = await readLock(createSessionClient(), id);
    if (!result.ok) return refusedResponse(result.code);
    return ok({ lock: result.lock });
  } catch (e) {
    return failedResponse(e, ROUTE);
  }
}

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
    const body = await readBody(request, acquireBody);
    if (body === null) return fail(400, 'invalid_input');

    const client = createSessionClient();
    const result = await acquireLock(
      client,
      id,
      body.deviceId ?? null,
      eventLogIp(request.headers),
    );
    if (!result.ok) return refusedResponse(result.code);
    if (result.status === 'acquired') {
      return ok({ lock: { lockEpoch: result.lockEpoch, since: result.since } });
    }
    const state = await readLock(client, id);
    const name =
      state.ok && state.lock.holder?.appUserId === result.holderAppUserId
        ? state.lock.holder.name
        : '';
    return Response.json(
      {
        error: { code: 'lock_held', message_key: 'error.lock_held' },
        holder: { appUserId: result.holderAppUserId, name },
        since: result.since,
      },
      { status: 409, headers: LOCK_HEADERS },
    );
  } catch (e) {
    return failedResponse(e, ROUTE);
  }
}

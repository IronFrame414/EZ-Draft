// EZD-1201 (Q-0213 Share panel "Link on or off, who it was sent to, expiry date"; Q-0700 10 row): a project's
// share links, newest first. GET ?projectId=<uuid>. Order: 401, 403 (no Send to client), 404 (a malformed id
// or a project out of scope), then 200 `{ links }`. No token or hash is in a row: Copy link exists only in the
// send response (Q-0700).
import { z } from 'zod';
import { endedSessionResponse } from '../../../server/auth/ended-session';
import { createSessionClient } from '../../../server/auth/supabase-server';
import { reportRouteFailure } from '../../../server/errors/route-failure';
import { requireApiPermission, requirePermission } from '../../../server/permissions';
import { fail, SHARE_LINK_HEADERS } from '../../../server/share-links/route-helpers';
import { listShareLinks } from '../../../server/share-links/share-links';

export const dynamic = 'force-dynamic';

const ROUTE = '/api/share-links';

export async function GET(request: Request): Promise<Response> {
  try {
    const projectId = new URL(request.url).searchParams.get('projectId') ?? '';
    const p = await requireApiPermission('send_to_client');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(projectId).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'send_to_client', { projectId });
    if (denied) return denied;
    const result = await listShareLinks(createSessionClient(), projectId);
    if (!result.ok) {
      if (result.code === 'permission_denied')
        return fail(403, 'permission_denied', 'error.not_authorized');
      return fail(404, 'project_not_found');
    }
    return Response.json({ links: result.links }, { status: 200, headers: SHARE_LINK_HEADERS });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

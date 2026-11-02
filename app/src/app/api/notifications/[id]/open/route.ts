// EZD-110a Step 14 (vault/plans/EZD-110a.md Decided D8, D10; AC-EZD-110-7; Q-0086): open one of the caller's
// notifications: it is marked read and its stored link is returned. Order: 401, 403 (no View projects, before
// the function runs, so the row stays unread), 404 notification_not_found (a malformed id, or no row of the
// caller's in scope), 404 project_gone (its project was deleted), 403 when the project is out of the
// caller's permission scope, else 200 { link }.
import { z } from 'zod';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { openNotification } from '../../../../../server/notifications/notifications';
import { can, requireApiPermission } from '../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/notifications/[id]/open';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const p = await requireApiPermission('view_projects');
    // D8: no-store on every response, the guard's 401 included.
    if (p instanceof Response) {
      p.headers.set('Cache-Control', 'no-store');
      return p;
    }
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return fail(404, 'notification_not_found');
    const opened = await openNotification(createSessionClient(), id);
    if (opened === null) return fail(404, 'notification_not_found');
    if (opened.projectState === 'gone') return fail(404, 'project_gone', 'error.job_not_found');
    if (
      opened.projectState === 'visible' &&
      opened.projectId !== null &&
      !can(p.ctx, 'view_projects', { projectId: opened.projectId })
    )
      return fail(403, 'permission_denied', 'error.not_authorized');
    return Response.json({ link: opened.link }, { status: 200, headers });
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

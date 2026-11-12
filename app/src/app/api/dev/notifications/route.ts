// EZD-110a Step 16 (vault/plans/EZD-110a.md Decided D8, D12; Q-0413): send the caller a notification of any
// kind for the /dev/notifications test page. Not found in production. Order: production bare 404, then 401,
// then 403 (no View projects), then 400 (not JSON, unknown kind, params not the kind's), then 404
// project_not_found (a listed member's unlisted project, or a database scope refusal 42501, so the answer
// does not reveal whether the project exists), then the insert and the job run kick; 201.
// EZD-323: sendTestNotification runs with the secret-key client and the caller's membership id.
import { z } from 'zod';
import { NOTIFICATION_KINDS } from '../../../../lib/notifications/kinds';
import { NOTIFICATION_PARAM_SCHEMAS } from '../../../../lib/notifications/param-schemas';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { createJobsDbClient } from '../../../../server/jobs/db';
import { kickJobRunner } from '../../../../server/jobs/kick';
import { sendTestNotification } from '../../../../server/notifications/notifications';
import {
  requireApiPermission,
  requirePermission,
  type Permitted,
} from '../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/dev/notifications';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

const bodySchema = z.object({
  kind: z.enum(NOTIFICATION_KINDS),
  projectId: z.uuid().optional(),
  params: z.unknown(),
});

export async function POST(request: Request): Promise<Response> {
  if (process.env.VERCEL_ENV === 'production') return new Response(null, { status: 404 });
  let p: Permitted | Response;
  try {
    p = await requireApiPermission('view_projects');
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
  if (p instanceof Response) return p;

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, 'invalid_input');
  const { kind, projectId } = body.data;
  const params = NOTIFICATION_PARAM_SCHEMAS[kind].safeParse(body.data.params);
  if (!params.success) return fail(400, 'invalid_input');

  if (projectId !== undefined) {
    const denied = requirePermission(p.ctx, 'view_projects', { projectId });
    if (denied) return denied;
  }

  try {
    const id = await sendTestNotification(createJobsDbClient(), {
      membershipId: p.ctx.membershipId,
      kind,
      projectId: projectId ?? null,
      params: params.data,
    });
    kickJobRunner();
    return Response.json({ notification: { id, link: '/' } }, { status: 201, headers });
  } catch (e) {
    if ((e as { code?: unknown }).code === '42501') return fail(404, 'project_not_found');
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

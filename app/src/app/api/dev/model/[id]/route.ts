// EZD-120d Build step 16 (vault/plans/EZD-120d.md Decided "Dev route"; Q-0505; Q-0508): the number of checkpoints
// a project has, for the save test page. Not found in production. Order: production 404, then 401, then 404 for
// a malformed id, then the permission check (view_projects), then the count under the member's session.
// Pattern: app/src/app/api/dev/permissions/projects/[id]/route.ts.
import { z } from 'zod';
import { requireApiSession } from '../../../../../server/auth/session';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { requireApiPermission } from '../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/dev/model/[id]';

const notFound = () =>
  Response.json(
    { error: { code: 'project_not_found', message_key: 'error.project_not_found' } },
    { status: 404, headers },
  );

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (process.env.VERCEL_ENV === 'production') return new Response(null, { status: 404 });
  try {
    const s = await requireApiSession();
    if (s instanceof Response) return s;
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return notFound();
    const permitted = await requireApiPermission('view_projects', { projectId: id });
    if (permitted instanceof Response) return permitted;
    const { count, error } = await createSessionClient()
      .from('model_version')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', id);
    if (error) throw error;
    return Response.json({ checkpoints: count ?? 0 }, { status: 200, headers });
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return Response.json(
      { error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } },
      { status: 500, headers },
    );
  }
}

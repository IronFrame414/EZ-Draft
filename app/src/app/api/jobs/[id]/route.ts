// EZD-009 Step 6 (vault/plans/EZD-009.md): read one job through the user's session client, so RLS decides
// what is visible. Not a UUID, or no visible row, is 404 and does not reveal whether the job exists
// (docs/architecture.md Errors and logging). An explicit field list: never payload, state, run_id or the
// lease. EZD-145 (vault/plans/EZD-145.md): the server checks View projects with can() before RLS does.
// Order: 401, then 403 (no View projects), then 404 for a malformed id, no visible row or a job on a
// project outside a listed member's projects (the same body as a missing job), then 200. A tenant-level job
// (no project) has no project to check; RLS already limits it to all-projects members.
import { z } from 'zod';
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { can, requireApiPermission } from '../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/jobs/[id]';

// A failed session read or database error (Q-0168 (b); architecture Errors and logging).
const dbUnavailable = () =>
  Response.json(
    { error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } },
    { status: 500, headers },
  );

const notFound = () =>
  Response.json(
    { error: { code: 'job_not_found', message_key: 'error.job_not_found' } },
    { status: 404, headers },
  );

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return notFound();
    const { data, error } = await createSessionClient()
      .from('job')
      .select(
        'id, project_id, kind, status, progress, attempts, error, result, created_at, updated_at, finished_at',
      )
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return notFound();
    if (data.project_id !== null && !can(p.ctx, 'view_projects', { projectId: data.project_id })) {
      return notFound();
    }
    return Response.json(
      {
        job: {
          id: data.id,
          projectId: data.project_id,
          kind: data.kind,
          status: data.status,
          progress: data.progress,
          attempts: data.attempts,
          error: data.error,
          result: data.result,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          finishedAt: data.finished_at,
        },
      },
      { status: 200, headers },
    );
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return dbUnavailable();
  }
}

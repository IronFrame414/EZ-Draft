// EZD-009 Step 6 (vault/plans/EZD-009.md): read one job through the user's session client, so RLS decides
// what is visible. Not a UUID, or no visible row, is 404 and does not reveal whether the job exists
// (docs/architecture.md Errors and logging). An explicit field list: never payload, state, run_id or the
// lease.
import { z } from 'zod';
import { requireApiSession } from '../../../../server/auth/session';
import { createSessionClient } from '../../../../server/auth/supabase-server';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };

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
    const s = await requireApiSession();
    if (s instanceof Response) return s;
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
  } catch {
    return dbUnavailable();
  }
}

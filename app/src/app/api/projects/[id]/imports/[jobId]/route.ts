// EZD-307 (S02 Layout, Data shown; Permissions "View projects: view the review in read-only"): one import for Import
// review, read through the caller's session client so RLS decides what is visible (server/imports/review.ts).
// Order, as GET /api/jobs/[id]: 401, 403 without View projects, 404 for a malformed id, 403 for a project outside
// a listed member's projects, 404 for an import RLS hides or that is not this project's, then 200. Any other
// failure is 500 after reportRouteFailure.
import { z } from 'zod';
import { createSessionClient } from '../../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../../server/errors/route-failure';
import { readImportReview } from '../../../../../../server/imports/review';
import { requireApiPermission, requirePermission } from '../../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/imports/[jobId]';

const notFound = () =>
  Response.json(
    { error: { code: 'import_not_found', message_key: 'error.import_not_found' } },
    { status: 404, headers },
  );

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; jobId: string }> },
): Promise<Response> {
  try {
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    const { id, jobId } = await params;
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(jobId).success) return notFound();
    const denied = requirePermission(p.ctx, 'view_projects', { projectId: id });
    if (denied) return denied;
    const review = await readImportReview(createSessionClient(), id, jobId);
    if (!review) return notFound();
    return Response.json({ review }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return Response.json(
      { error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } },
      { status: 500, headers },
    );
  }
}

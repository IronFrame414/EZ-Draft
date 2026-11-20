// EZD-122 (S20 "Version row: opens the version read-only on the canvas"; 03b rule 5; AC-EZD-122-3, -10): one
// version's objects, migrated to the current schema, for the read-only view. Order: 401, 403 (no View projects),
// 404 (a malformed id, a project out of scope, or a version that is not this project's), then `readVersion` under
// the member's session (RLS). 200 `{ version: { id, objects }, invalid }`.
import { z } from 'zod';
import { createSessionClient } from '../../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../../server/errors/route-failure';
import { requireApiPermission, requirePermission } from '../../../../../../server/permissions';
import { readVersion } from '../../../../../../server/versions/versions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/versions/[versionId]';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
): Promise<Response> {
  try {
    const { id, versionId } = await params;
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'view_projects', { projectId: id });
    if (denied) return denied;
    if (!z.uuid().safeParse(versionId).success) return fail(404, 'version_not_found');

    const read = await readVersion(createSessionClient(), id, versionId);
    if (read === null) return fail(404, 'version_not_found');
    return Response.json({ version: read.doc, invalid: read.invalid }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

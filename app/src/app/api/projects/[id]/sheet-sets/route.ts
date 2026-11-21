// EZD-726 (S13 Set selector; 03d sheet_set; AC-EZD-726-1): the set selector query. Order as the submittal-profile
// route: 401, 403, 404 (a malformed id or a project out of scope), then the session client.
// GET (View projects): 200 { sets }: the project's permit set then its client set, each with its kind, size, symbol
// key placement, last issued version (null until issued) and sheets in set order. id is the set's model object id,
// null while the set is the unchanged default.
import { z } from 'zod';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { requireApiPermission, requirePermission } from '../../../../../server/permissions';
import { loadProjectSheetSets } from '../../../../../server/sheets/sheets';
import type { SheetSetSummary } from '../../../../../lib/sheets/sheet-set';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/sheet-sets';

export type SheetSetsAnswer = { sets: SheetSetSummary[] };

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'view_projects', { projectId: id });
    if (denied) return denied;
    const sets = await loadProjectSheetSets(createSessionClient(), id);
    if (sets === null) return fail(404, 'project_not_found');
    const answer: SheetSetsAnswer = { sets };
    return Response.json(answer, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

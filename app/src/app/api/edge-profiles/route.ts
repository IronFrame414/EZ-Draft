// EZD-417 (03c edge_profile; S04b Permissions "View projects: view pieces, overhangs, profiles"; S04b Controls "Edge
// profile card | Pick profile from library"): the company's edge profile library, in library order. Order: 401,
// 403 (no View projects), then 200 `{ profiles: [{ id, key, name, sectionSvg }] }`. No price is stored on a profile.
import { endedSessionResponse } from '../../../server/auth/ended-session';
import { createSessionClient } from '../../../server/auth/supabase-server';
import { listEdgeProfiles } from '../../../server/countertops/edge-profiles';
import { reportRouteFailure } from '../../../server/errors/route-failure';
import { requireApiPermission } from '../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/edge-profiles';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function GET(): Promise<Response> {
  try {
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    const profiles = await listEdgeProfiles(createSessionClient());
    return Response.json({ profiles }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

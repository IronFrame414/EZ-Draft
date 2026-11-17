// EZD-129 (Q-0202; Q-0397; boards S01bForeman, S01bForemanStates; AC-EZD-129-3): the New project wizard's
// Foreman candidates, the company's active members by name: { members: { membershipId, name, email, scope }[] }.
// Order: 401, 403 (no Create projects), then the definer function under the session (it checks Create
// projects again). Any throw is reported once and answers 500 db_unavailable.
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { requireApiPermission } from '../../../../server/permissions';
import { memberFail } from '../../../../server/users/member-route';
import { listForemanCandidates } from '../../../../server/users/scope';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/foremen';

export async function GET(): Promise<Response> {
  try {
    const p = await requireApiPermission('create_projects');
    if (p instanceof Response) return p;
    const r = await listForemanCandidates(createSessionClient());
    if (!r.ok) return memberFail(r.refusal.status, r.refusal.code);
    return Response.json({ members: r.value }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return memberFail(500, 'db_unavailable');
  }
}

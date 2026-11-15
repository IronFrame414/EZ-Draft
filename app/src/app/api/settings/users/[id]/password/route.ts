// EZD-105b (vault/plans/EZD-105b.md Decided "Route order", "Route permission check"; Q-0096 P3, P4; Q-0695
// decisions 10 rows 59, 65): an Owner sets a member's password (the [id] is the membership id). No permission
// switch: the Owner-preset check is inside owner_password_target and record_member_password_set
// (WRITE_PERMISSION_EXEMPTIONS). Order: 401, 404 for a malformed id, then setOwnerPassword. The request body is
// never read: the password is always made on the server, and it is in the 200 body only (no-store).
import { endedSessionResponse } from '../../../../../../server/auth/ended-session';
import { requireApiSession } from '../../../../../../server/auth/session';
import { createSessionClient } from '../../../../../../server/auth/supabase-server';
import { reportRouteFailure } from '../../../../../../server/errors/route-failure';
import { eventLogIp } from '../../../../../../server/events/event-log';
import { memberFail } from '../../../../../../server/users/member-route';
import { isMembershipId } from '../../../../../../server/users/members';
import { ROUTE, setOwnerPassword } from '../../../../../../server/users/owner-password';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireApiSession();
    if (session instanceof Response) return session;
    const { id } = await ctx.params;
    if (!isMembershipId(id)) return memberFail(404, 'member_not_found');
    const result = await setOwnerPassword(createSessionClient(), id, eventLogIp(request.headers));
    if (result.status === 200) {
      return Response.json(result.body, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    }
    return memberFail(result.status, result.code);
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return memberFail(500, 'db_unavailable');
  }
}

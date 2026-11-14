// EZD-105 (S15 Invite user; Q-0695 decisions 10 rows 59, 61, 63; R24 #15): POST invites one person (body
// { email, name?, roleId, language?, scope? }). Order: 401, 403 (no settings_users), 400 (body: invalid_input
// or invalid_email), create_invite under the inviter's session (it checks the switch again and writes the
// user.invited event_log row in its transaction), its refusals (403, 400, 409 already_member,
// already_invited, deactivated_member, email_in_use), the invite email, then 201 with the new membershipId,
// the link and the code; the link is returned whether the email went out or not (emailSent says which).
// user.invited is emitted after the commit (log_only; the sink skips it).
import { requireApiPermission } from '../../../../../server/permissions';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { errorType } from '../../../../../server/errors/fingerprint';
import { reportError } from '../../../../../server/errors/report';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { emit } from '../../../../../server/events';
import { memberFail } from '../../../../../server/users/member-route';
import { createInvite, parseInviteInput } from '../../../../../server/users/invites';

export const dynamic = 'force-dynamic';

const ROUTE = '/api/settings/users/invites';

export async function POST(request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission('settings_users');
    if (p instanceof Response) return p;
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return memberFail(400, 'invalid_input');
    }
    const parsed = parseInviteInput(raw);
    if (!parsed.ok) return memberFail(400, parsed.code);
    const r = await createInvite(createSessionClient(), parsed.input, { email: p.session.email });
    if (!r.ok) return memberFail(r.refusal.status, r.refusal.code);
    const v = r.value;
    try {
      await emit(
        'user.invited',
        { membershipId: v.membershipId, appUserId: v.appUserId, roleId: v.roleId, scope: v.scope },
        { tenantId: v.tenantId, actorId: p.session.appUserId },
      );
    } catch (err) {
      try {
        await reportError(new Error('user.invited_event_failed'), {
          source: 'function',
          location: ROUTE,
          tags: { 'ezd.cause': errorType(err) },
        });
      } catch {
        /* reportError never throws; guarded as member-route.ts does */
      }
    }
    return Response.json(
      {
        membershipId: v.membershipId,
        link: v.link,
        code: v.code,
        expiresAt: v.expiresAt,
        emailSent: v.emailSent,
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return memberFail(500, 'db_unavailable');
  }
}

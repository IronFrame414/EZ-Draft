// EZD-105 (S15 Row: Resend; Q-0695 decisions 10 rows 61, 63): re-sends a pending invite (the [id] is its
// membership id). A new link and code are made, the 7 days start again from now, the old link and code stop
// working, and the caller becomes the sender (so they now see Copy link, Q-0706). Answers 200 with the new link
// and code whether the email went out or not; user.invite_resent is written in the same transaction and
// emitted after it (log_only). Shared order and errors: server/users/member-route.ts.
import { requireApiPermission } from '../../../../../../../server/permissions';
import { runMemberWrite } from '../../../../../../../server/users/member-route';
import { resendInvite } from '../../../../../../../server/users/invites';

export const dynamic = 'force-dynamic';

const ROUTE = '/api/settings/users/invites/[id]/resend';

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return runMemberWrite(
    ROUTE,
    ctx,
    () => requireApiPermission('settings_users'),
    async (client, id, p) => {
      const r = await resendInvite(client, id, { email: p.session.email });
      if (!r.ok) return r;
      const v = r.value;
      return {
        ok: true,
        tenantId: v.tenantId,
        events: [
          {
            name: 'user.invite_resent',
            payload: { membershipId: v.membershipId, appUserId: v.appUserId },
          },
        ],
        body: {
          membershipId: v.membershipId,
          link: v.link,
          code: v.code,
          expiresAt: v.expiresAt,
          emailSent: v.emailSent,
        },
      };
    },
  );
}

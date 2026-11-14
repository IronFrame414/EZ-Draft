// EZD-105 (S15 Row: Copy link, More menu Cancel invite; Q-0216; Q-0706; Q-0695 decisions 10 row 62): the [id] is
// the pending row's membership id. GET answers the invite's link and code for Copy link, to the last sender and
// active Owner-preset members only (404 member_not_found for anyone else). DELETE cancels the invite: the
// invited membership and its invite are deleted, and user.invite_cancelled is written in the same transaction
// and emitted after it (log_only). Shared order and errors: server/users/member-route.ts.
import { requireApiPermission } from '../../../../../../server/permissions';
import { runMemberWrite } from '../../../../../../server/users/member-route';
import { cancelInvite, inviteLinkFor } from '../../../../../../server/users/invites';

export const dynamic = 'force-dynamic';

const ROUTE = '/api/settings/users/invites/[id]';

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return runMemberWrite(
    ROUTE,
    ctx,
    () => requireApiPermission('settings_users'),
    async (client, id) => {
      const r = await inviteLinkFor(client, id);
      if (!r.ok) return r;
      // A read: no event.
      return { ok: true, tenantId: '', events: [], body: r.value };
    },
  );
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return runMemberWrite(
    ROUTE,
    ctx,
    () => requireApiPermission('settings_users'),
    async (client, id) => {
      const r = await cancelInvite(client, id);
      if (!r.ok) return r;
      const { membershipId, appUserId, tenantId } = r.value;
      return {
        ok: true,
        tenantId,
        events: [{ name: 'user.invite_cancelled', payload: { membershipId, appUserId } }],
        body: { membershipId },
      };
    },
  );
}

// EZD-106 (vault/plans/EZD-106.md Part a "Routes"; S15 More menu; Q-0695 decisions 10 row 62): reactivates one
// member (the [id] is the membership id) and emits user.reactivated (log_only, Q-0706). Shared order and
// errors: server/users/member-route.ts.
import { requireApiPermission } from '../../../../../../server/permissions';
import { runMemberWrite } from '../../../../../../server/users/member-route';
import { memberAction } from '../../../../../../server/users/members';

export const dynamic = 'force-dynamic';

const ROUTE = '/api/settings/users/[id]/reactivate';

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return runMemberWrite(
    ROUTE,
    ctx,
    () => requireApiPermission('settings_users'),
    async (client, id) => {
      const r = await memberAction(client, 'reactivate_member', id);
      if (!r.ok) return r;
      const { membershipId, appUserId, tenantId } = r.value;
      return {
        ok: true,
        tenantId,
        events: [{ name: 'user.reactivated', payload: { membershipId, appUserId } }],
        body: { membershipId },
      };
    },
  );
}

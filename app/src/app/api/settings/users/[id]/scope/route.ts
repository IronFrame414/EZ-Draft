// EZD-129 (S15 Decision 13; Q-0695 decisions 10 rows 59, 63, 64; AC-EZD-129-2, -4): a member's Project access.
// GET answers { scope, projects: { id, name }[] }; PUT saves the full new list (body { scope, projectIds }) and
// answers the same shape. The [id] is the membership id. Shared order and errors: server/users/member-route.ts
// (401, 403 without settings_users, 404 member_not_found, 400 invalid_input / project_unavailable, 500).
// PUT emits user.scope_changed (log_only) when something changed; the function wrote its event_log row.
import { requireApiPermission } from '../../../../../../server/permissions';
import { memberFail, runMemberWrite } from '../../../../../../server/users/member-route';
import {
  getMemberScope,
  parseSaveScopeInput,
  saveMemberScope,
} from '../../../../../../server/users/scope';

export const dynamic = 'force-dynamic';

const ROUTE = '/api/settings/users/[id]/scope';

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return runMemberWrite(
    ROUTE,
    ctx,
    () => requireApiPermission('settings_users'),
    async (client, id) => {
      const r = await getMemberScope(client, id);
      if (!r.ok) return r;
      // A read emits nothing, so no company id is needed for events.
      return { ok: true, tenantId: '', events: [], body: r.value };
    },
  );
}

export async function PUT(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return runMemberWrite(
    ROUTE,
    ctx,
    () => requireApiPermission('settings_users'),
    async (client, id) => {
      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        return memberFail(400, 'invalid_input');
      }
      const input = parseSaveScopeInput(raw);
      if (input === null) return memberFail(400, 'invalid_input');
      const r = await saveMemberScope(client, id, input);
      if (!r.ok) return r;
      const v = r.value;
      return {
        ok: true,
        tenantId: v.tenantId,
        events: v.changed
          ? [
              {
                name: 'user.scope_changed',
                payload: {
                  membershipId: v.membershipId,
                  appUserId: v.appUserId,
                  oldScope: v.oldScope,
                  scope: v.scope,
                  added: v.added,
                  removed: v.removed,
                },
              },
            ]
          : [],
        body: { scope: v.scope, projects: v.projects },
      };
    },
  );
}

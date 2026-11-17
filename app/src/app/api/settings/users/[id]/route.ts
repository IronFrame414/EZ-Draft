// EZD-106 (vault/plans/EZD-106.md Part a "Routes"; S15 Save, More menu Remove; Q-0695 decisions 10 rows 59, 62):
// PATCH saves one member's role, language and 37 switches (body { roleId, language, grantedKeys }); DELETE
// removes the member. The [id] is the membership id. Shared order and errors: server/users/member-route.ts.
// Save emits user_permission.updated when a switch or the role changed and user.language_changed when the
// language changed; Remove emits user.removed (all log_only, Q-0706).
import { requireApiPermission } from '../../../../../server/permissions';
import type { PendingEvent } from '../../../../../server/users/member-route';
import { memberFail, runMemberWrite } from '../../../../../server/users/member-route';
import {
  memberAction,
  parseSaveMemberInput,
  saveMember,
} from '../../../../../server/users/members';

export const dynamic = 'force-dynamic';

const ROUTE = '/api/settings/users/[id]';

export async function PATCH(
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
      const input = parseSaveMemberInput(raw);
      if (input === null) return memberFail(400, 'invalid_input');
      const r = await saveMember(client, id, input);
      if (!r.ok) return r;
      const v = r.value;
      const events: PendingEvent[] = [];
      if (v.changedKeys.length > 0 || v.roleChanged) {
        events.push({
          name: 'user_permission.updated',
          payload: {
            membershipId: v.membershipId,
            appUserId: v.appUserId,
            changedKeys: v.changedKeys,
            roleId: v.roleId,
            roleChanged: v.roleChanged,
          },
        });
      }
      if (v.languageChanged) {
        events.push({
          name: 'user.language_changed',
          payload: { appUserId: v.appUserId, language: v.language },
        });
      }
      return {
        ok: true,
        tenantId: v.tenantId,
        events,
        body: {
          membershipId: v.membershipId,
          changedKeys: v.changedKeys,
          roleChanged: v.roleChanged,
          languageChanged: v.languageChanged,
        },
      };
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
      const r = await memberAction(client, 'remove_member', id);
      if (!r.ok) return r;
      const { membershipId, appUserId, tenantId } = r.value;
      return {
        ok: true,
        tenantId,
        events: [{ name: 'user.removed', payload: { membershipId, appUserId } }],
        body: { membershipId },
      };
    },
  );
}

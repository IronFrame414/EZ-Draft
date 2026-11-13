// EZD-106 (vault/plans/EZD-106.md Part a "Routes"; architecture "Errors and logging"): the shared body of the
// Users page member write routes. Order: 401, 403 (no settings_users), 404 for a malformed id, 400 (body), the
// definer function under the member's session (it checks the switch again), its refusals (403, 404, 409,
// 400), then 200. Events go out after the write has committed; a failed emit is reported and does not fail
// the write (EZD-283 pattern, app/src/app/api/settings/company/route.ts).
import type { EventName, EventPayloads } from '../../lib/events/registry';
import { createSessionClient } from '../auth/supabase-server';
import type { Database } from '../db/database.types';
import { errorType } from '../errors/fingerprint';
import { reportError } from '../errors/report';
import { reportRouteFailure } from '../errors/route-failure';
import { emit } from '../events';
import type { Permitted } from '../permissions/can';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isMembershipId, type MemberRefusal } from './members';

const headers = { 'Cache-Control': 'no-store' };

export const memberFail = (status: number, code: string) =>
  Response.json(
    {
      error: {
        code,
        message_key: code === 'permission_denied' ? 'error.not_authorized' : `error.${code}`,
      },
    },
    { status, headers },
  );

export type PendingEvent = {
  [N in EventName]: { name: N; payload: EventPayloads[N] };
}[EventName];

export type MemberWriteOutcome =
  | { ok: false; refusal: MemberRefusal }
  | { ok: true; body: unknown; tenantId: string; events: PendingEvent[] };

// `permit` is the route's own requireApiPermission('settings_users') call (write-routes U8 reads it there).
export async function runMemberWrite(
  route: string,
  ctx: { params: Promise<{ id: string }> },
  permit: () => Promise<Permitted | Response>,
  write: (
    client: SupabaseClient<Database>,
    membershipId: string,
  ) => Promise<MemberWriteOutcome | Response>,
): Promise<Response> {
  try {
    const p = await permit();
    if (p instanceof Response) return p;
    const { id } = await ctx.params;
    if (!isMembershipId(id)) return memberFail(404, 'member_not_found');
    const out = await write(createSessionClient(), id);
    if (out instanceof Response) return out;
    if (!out.ok) return memberFail(out.refusal.status, out.refusal.code);
    for (const e of out.events) {
      try {
        await emit(e.name, e.payload as never, {
          tenantId: out.tenantId,
          actorId: p.session.appUserId,
        });
      } catch (err) {
        try {
          await reportError(new Error(`${e.name}_event_failed`), {
            source: 'function',
            location: route,
            tags: { 'ezd.cause': errorType(err) },
          });
        } catch {
          /* reportError never throws; guarded as route-failure.ts does */
        }
      }
    }
    return Response.json(out.body, { status: 200, headers });
  } catch (e) {
    await reportRouteFailure(e, route);
    return memberFail(500, 'db_unavailable');
  }
}

// EZD-107 (S15 Role card, New role, Events; Q-0695 decisions 10 row 59; architecture "Errors and logging"): the
// shared body of the custom role routes. Order: 401, 403 (no settings_users), 404 for a malformed id, 400
// (body), the definer function under the member's session (it checks the switch again), its refusals, then
// the answer. Events go out after the write has committed; a failed emit is reported and does not fail the
// write (the EZD-106 member-route pattern).
import type { EventName, EventPayloads } from '../../lib/events/registry';
import { createSessionClient } from '../auth/supabase-server';
import type { Database } from '../db/database.types';
import { errorType } from '../errors/fingerprint';
import { reportError } from '../errors/report';
import { reportRouteFailure } from '../errors/route-failure';
import { emit } from '../events';
import type { Permitted } from '../permissions/can';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isRoleId, type RoleRefusal } from './roles';

export const headers = { 'Cache-Control': 'no-store' };

export const roleFail = (status: number, code: string) =>
  Response.json(
    {
      error: {
        code,
        message_key: code === 'permission_denied' ? 'error.not_authorized' : `error.${code}`,
      },
    },
    { status, headers },
  );

export type PendingRoleEvent = {
  [N in EventName]: { name: N; payload: EventPayloads[N] };
}[EventName];

export type RoleWriteOutcome =
  | { ok: false; refusal: RoleRefusal }
  | { ok: true; status: number; body: unknown; tenantId: string; events: PendingRoleEvent[] };

// `permit` is the route's own requireApiPermission('settings_users') call. `id` is null for the collection
// route; a given id must be a uuid (404 role_not_found otherwise).
export async function runRoleWrite(
  route: string,
  id: Promise<string> | null,
  permit: () => Promise<Permitted | Response>,
  write: (client: SupabaseClient<Database>, roleId: string) => Promise<RoleWriteOutcome | Response>,
): Promise<Response> {
  try {
    const p = await permit();
    if (p instanceof Response) return p;
    const roleId = id === null ? '' : await id;
    if (id !== null && !isRoleId(roleId)) {
      return roleFail(404, 'role_not_found');
    }
    const out = await write(createSessionClient(), roleId);
    if (out instanceof Response) return out;
    if (!out.ok) return roleFail(out.refusal.status, out.refusal.code);
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
    return Response.json(out.body, { status: out.status, headers });
  } catch (e) {
    await reportRouteFailure(e, route);
    return roleFail(500, 'db_unavailable');
  }
}

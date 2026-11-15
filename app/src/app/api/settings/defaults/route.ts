// EZD-116 (S15d Save, Events; Q-0697 decisions 03 "Defaults data", 10 "Phase 8 permissions"; Q-0210):
// Settings > Defaults. GET: any active member reads the stored and effective company values (no switch).
// PATCH: settings_defaults (403 without it), then the body (400 invalid_input; per-row refusals as
// `fields`), the rules between rows on the values after the save, then update_tenant_defaults under the
// member's session (it checks the switch again and writes only the keys sent). `tenant.defaults_updated`
// is emitted when a stored value changed; a failed emit is reported and does not fail the save.
import { requireApiSession } from '../../../../server/auth/session';
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../server/auth/ended-session';
import {
  crossCheckAfter,
  loadTenantDefaults,
  parseDefaultsChanges,
  saveTenantDefaults,
} from '../../../../server/defaults/defaults';
import { errorType } from '../../../../server/errors/fingerprint';
import { reportError } from '../../../../server/errors/report';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { emit } from '../../../../server/events';
import { getPermissionContext, requireApiPermission } from '../../../../server/permissions';
import { effectiveDefaults } from '../../../../lib/defaults/values';
import type { MessageKey } from '../../../../server/messages/catalog';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/settings/defaults';
const EMIT_FAILED = 'defaults_tenant_event_failed';

const fail = (
  status: number,
  code: string,
  messageKey = `error.${code}`,
  fields?: Record<string, MessageKey>,
) =>
  Response.json(
    { error: { code, message_key: messageKey, ...(fields ? { fields } : {}) } },
    { status, headers },
  );

export async function GET(): Promise<Response> {
  try {
    const s = await requireApiSession();
    if (s instanceof Response) return s;
    const ctx = await getPermissionContext();
    if (ctx === null) return fail(403, 'permission_denied', 'error.not_authorized');
    const stored = await loadTenantDefaults(createSessionClient());
    return Response.json(
      { stored, effective: effectiveDefaults(stored) },
      { status: 200, headers },
    );
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission('settings_defaults');
    if (p instanceof Response) return p;

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const parsed = parseDefaultsChanges(raw);
    if (!parsed.ok) return fail(400, 'invalid_input', 'error.invalid_input', parsed.fields);

    const client = createSessionClient();
    const current = await loadTenantDefaults(client);
    const rules = crossCheckAfter(current, parsed.changes);
    if (Object.keys(rules).length > 0) return fail(400, 'invalid_input', 'error.invalid_input', rules);

    const saved = await saveTenantDefaults(client, parsed.changes);
    if (!saved.ok) {
      return saved.code === 'permission_denied'
        ? fail(403, 'permission_denied', 'error.not_authorized')
        : fail(400, 'invalid_input');
    }

    if (saved.changed.length > 0) {
      try {
        await emit(
          'tenant.defaults_updated',
          { keys: saved.changed },
          { tenantId: saved.tenantId, actorId: p.session.appUserId },
        );
      } catch (e) {
        try {
          await reportError(new Error(EMIT_FAILED), {
            source: 'function',
            location: ROUTE,
            tags: { 'ezd.cause': errorType(e) },
          });
        } catch {
          /* reportError never throws; guarded as route-failure.ts does */
        }
      }
    }

    return Response.json(
      { stored: saved.stored, effective: effectiveDefaults(saved.stored) },
      { status: 200, headers },
    );
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

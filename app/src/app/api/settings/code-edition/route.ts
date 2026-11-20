// EZD-613 (S15g Save, Events; Q-0210; AC-EZD-613-1): Settings > Code edition.
// GET: any active member reads the company's default edition, the optional load-calc method default and the
// available rule sets (no switch; the editor and Project settings show the edition too).
// PATCH: settings_code_edition (403 without it), then the body `{ edition?, optionalLoadCalc? }` (400
// invalid_input), then update_tenant_code_edition under the member's session (it checks the switch again and
// never changes a project). `tenant.code_edition_updated` is emitted when something changed; a failed emit is
// reported and does not fail the save.
import { requireApiSession } from '../../../../server/auth/session';
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../server/auth/ended-session';
import {
  loadCodeEditionSettings,
  saveCodeEditionSettings,
} from '../../../../server/code-edition/code-edition';
import { errorType } from '../../../../server/errors/fingerprint';
import { reportError } from '../../../../server/errors/report';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { emit } from '../../../../server/events';
import { getPermissionContext, requireApiPermission } from '../../../../server/permissions';
import { parseCodeEditionPatch } from '../../../../lib/code-edition/editions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/settings/code-edition';
const EMIT_FAILED = 'code_edition_tenant_event_failed';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function GET(): Promise<Response> {
  try {
    const s = await requireApiSession();
    if (s instanceof Response) return s;
    const ctx = await getPermissionContext();
    if (ctx === null) return fail(403, 'permission_denied', 'error.not_authorized');
    const settings = await loadCodeEditionSettings(createSessionClient());
    return Response.json(settings, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission('settings_code_edition');
    if (p instanceof Response) return p;

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const patch = parseCodeEditionPatch(raw);
    if (patch === null) return fail(400, 'invalid_input');

    const saved = await saveCodeEditionSettings(createSessionClient(), patch);
    if (!saved.ok) {
      return saved.code === 'permission_denied'
        ? fail(403, 'permission_denied', 'error.not_authorized')
        : fail(400, 'invalid_input');
    }

    if (saved.changed.length > 0) {
      try {
        await emit(
          'tenant.code_edition_updated',
          { keys: saved.changed as ('code_edition' | 'optional_load_calc')[] },
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

    return Response.json(saved.settings, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

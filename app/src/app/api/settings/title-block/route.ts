// EZD-709 (S15b Save, Events; AC-EZD-709-1, AC-EZD-709-2): Settings > Title block.
// GET: any active member reads the title block settings (the switch, the company fields it shows, the code
// edition); EZD-710 prints the same values on every sheet.
// PATCH: settings_title_block (403 without it), then the body `{ showCompany }` (400 invalid_input), then
// update_tenant_title_block under the member's session (it checks the switch again). `tenant.title_block_updated`
// is emitted when something changed; a failed emit is reported and does not fail the save.
import { requireApiSession } from '../../../../server/auth/session';
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../server/auth/ended-session';
import { errorType } from '../../../../server/errors/fingerprint';
import { reportError } from '../../../../server/errors/report';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { emit } from '../../../../server/events';
import { getPermissionContext, requireApiPermission } from '../../../../server/permissions';
import { loadTitleBlockSettings, saveTitleBlock } from '../../../../server/title-block/title-block';
import { parseTitleBlockPatch } from '../../../../lib/title-block/title-block';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/settings/title-block';
const EMIT_FAILED = 'title_block_tenant_event_failed';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function GET(): Promise<Response> {
  try {
    const s = await requireApiSession();
    if (s instanceof Response) return s;
    const ctx = await getPermissionContext();
    if (ctx === null) return fail(403, 'permission_denied', 'error.not_authorized');
    const settings = await loadTitleBlockSettings(createSessionClient());
    if (settings === null) return fail(403, 'permission_denied', 'error.not_authorized');
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
    const p = await requireApiPermission('settings_title_block');
    if (p instanceof Response) return p;

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const patch = parseTitleBlockPatch(raw);
    if (patch === null) return fail(400, 'invalid_input');

    const saved = await saveTitleBlock(createSessionClient(), patch);
    if (!saved.ok) {
      return saved.code === 'permission_denied'
        ? fail(403, 'permission_denied', 'error.not_authorized')
        : fail(400, 'invalid_input');
    }

    if (saved.changed.length > 0) {
      try {
        await emit(
          'tenant.title_block_updated',
          { keys: saved.changed as 'show_company'[] },
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

    return Response.json(saved.config, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

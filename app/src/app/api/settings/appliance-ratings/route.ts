// EZD-614 (S15e Appliance rating defaults, Save, Events emitted "catalog.settings_updated (new)"; Q-0766;
// AC-EZD-614-1): Settings > Catalog, Appliance rating defaults.
// GET: any active member reads the company's list (the load calc runs in the editor and the sheets for everyone who
// opens them), `{ rows }`.
// PUT: settings_catalog (403 without it), then the body `{ rows }` (400 invalid_input), then
// save_appliance_rating_defaults under the member's session (it checks the switch again and replaces the list).
// `catalog.settings_updated` is emitted when something changed; a failed emit is reported and does not fail the save.
import { requireApiSession } from '../../../../server/auth/session';
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../server/auth/ended-session';
import {
  loadApplianceRatings,
  saveApplianceRatings,
} from '../../../../server/appliance-ratings/appliance-ratings';
import { errorType } from '../../../../server/errors/fingerprint';
import { reportError } from '../../../../server/errors/report';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { emit } from '../../../../server/events';
import { getPermissionContext, requireApiPermission } from '../../../../server/permissions';
import { parseApplianceRatingsBody } from '../../../../lib/appliance-ratings/ratings';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/settings/appliance-ratings';
const EMIT_FAILED = 'appliance_ratings_event_failed';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function GET(): Promise<Response> {
  try {
    const s = await requireApiSession();
    if (s instanceof Response) return s;
    const ctx = await getPermissionContext();
    if (ctx === null) return fail(403, 'permission_denied', 'error.not_authorized');
    const rows = await loadApplianceRatings(createSessionClient());
    return Response.json({ rows }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission('settings_catalog');
    if (p instanceof Response) return p;

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const rows = parseApplianceRatingsBody(raw);
    if (rows === null) return fail(400, 'invalid_input');

    const client = createSessionClient();
    const saved = await saveApplianceRatings(client, rows);
    if (!saved.ok) {
      return saved.code === 'permission_denied'
        ? fail(403, 'permission_denied', 'error.not_authorized')
        : fail(400, 'invalid_input');
    }

    if (saved.changed.length > 0) {
      try {
        await emit(
          'catalog.settings_updated',
          { section: 'appliance_ratings', applianceTypes: saved.changed },
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

    return Response.json({ rows: await loadApplianceRatings(client) }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

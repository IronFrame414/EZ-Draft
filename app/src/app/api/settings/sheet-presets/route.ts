// EZD-712 (S15c; AC-EZD-712-1): Settings > Sheet presets.
// GET: any active member reads the company's submittal profiles (Project settings and the Sheets screen pick from
// them), `{ profiles }`, the default first.
// POST: settings_sheet_presets (403 without it), then `{ department, sourceId? }` (400 invalid_input): New profile
// copies the default, Duplicate the given profile; 409 name_taken; 404 when the source is not the company's.
// 201 `{ profile }` and `submittal_profile.created`.
import { requireApiSession } from '../../../../server/auth/session';
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { getPermissionContext, requireApiPermission } from '../../../../server/permissions';
import {
  createSubmittalProfile,
  listSubmittalProfiles,
} from '../../../../server/submittal-profiles/submittal-profiles';
import {
  emitProfileEvent,
  fail,
  failureResponse,
  headers,
} from '../../../../server/submittal-profiles/route-helpers';
import { parseCreateBody } from '../../../../lib/submittal-profiles/profiles';

export const dynamic = 'force-dynamic';

const ROUTE = '/api/settings/sheet-presets';

export async function GET(): Promise<Response> {
  try {
    const s = await requireApiSession();
    if (s instanceof Response) return s;
    const ctx = await getPermissionContext();
    if (ctx === null) return fail(403, 'permission_denied', 'error.not_authorized');
    const profiles = await listSubmittalProfiles(createSessionClient());
    return Response.json({ profiles }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission('settings_sheet_presets');
    if (p instanceof Response) return p;
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const body = parseCreateBody(raw);
    if (body === null) return fail(400, 'invalid_input');

    const made = await createSubmittalProfile(createSessionClient(), body);
    if (!made.ok) return failureResponse(made.code);
    await emitProfileEvent(
      'submittal_profile.created',
      { profileId: made.value.profile.id, sourceId: made.value.sourceId },
      { tenantId: made.tenantId, actorId: p.session.appUserId },
      ROUTE,
    );
    return Response.json({ profile: made.value.profile }, { status: 201, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

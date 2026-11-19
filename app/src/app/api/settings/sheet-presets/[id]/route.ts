// EZD-712 (S15c): one submittal profile. settings_sheet_presets for both (403 without it).
// PATCH: exactly one of `{ fields }` (the inspector's Save), `{ setDefault: true }` (Set as default: the company
// default for new projects) or `{ archived }` (Archive or restore); 400 invalid_input, 409 name_taken, 409
// profile_is_default (the default cannot be archived), 404 not the company's. 200 `{ profile }`;
// `submittal_profile.updated` with the changed fields when something changed.
// DELETE: never the default (409 profile_is_default); its projects move to the default. 200 `{ movedProjects }`
// and `submittal_profile.deleted`.
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { requireApiPermission } from '../../../../../server/permissions';
import {
  deleteSubmittalProfile,
  patchSubmittalProfile,
} from '../../../../../server/submittal-profiles/submittal-profiles';
import {
  emitProfileEvent,
  fail,
  failureResponse,
  headers,
} from '../../../../../server/submittal-profiles/route-helpers';
import { isUuid, parsePatchBody } from '../../../../../lib/submittal-profiles/profiles';

export const dynamic = 'force-dynamic';

const ROUTE = '/api/settings/sheet-presets/[id]';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const p = await requireApiPermission('settings_sheet_presets');
    if (p instanceof Response) return p;
    const { id } = await ctx.params;
    if (!isUuid(id)) return fail(404, 'not_found');
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const body = parsePatchBody(raw);
    if (body === null) return fail(400, 'invalid_input');

    const saved = await patchSubmittalProfile(createSessionClient(), id, body);
    if (!saved.ok) return failureResponse(saved.code);
    if (saved.value.fields.length > 0) {
      await emitProfileEvent(
        'submittal_profile.updated',
        { profileId: id, fields: saved.value.fields },
        { tenantId: saved.tenantId, actorId: p.session.appUserId },
        ROUTE,
      );
    }
    return Response.json({ profile: saved.value.profile }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

export async function DELETE(_request: Request, ctx: Ctx): Promise<Response> {
  try {
    const p = await requireApiPermission('settings_sheet_presets');
    if (p instanceof Response) return p;
    const { id } = await ctx.params;
    if (!isUuid(id)) return fail(404, 'not_found');
    const done = await deleteSubmittalProfile(createSessionClient(), id);
    if (!done.ok) return failureResponse(done.code);
    await emitProfileEvent(
      'submittal_profile.deleted',
      { profileId: id, movedProjects: done.value.movedProjects },
      { tenantId: done.tenantId, actorId: p.session.appUserId },
      ROUTE,
    );
    return Response.json({ movedProjects: done.value.movedProjects }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

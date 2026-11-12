// EZD-108 Step 7 (vault/plans/EZD-108.md Decided "Routes"; S15 Avatar, Events; Q-0392): read and save the
// signed-in user's own profile (language and iPad drawing). Every signed-in user may (S15 Permissions);
// the session client and update_my_profile reach only the caller's own row. Order: 401, 400 (body), then
// the save; `user.language_changed` is emitted only when the language changed, and a dropped event does not
// fail the save but is reported. GET also gives the security check for Change password (Q-0465 (a)), read
// per request.
import { captchaConfig } from '../../../server/auth/captcha-config';
import { requireApiSession } from '../../../server/auth/session';
import { createSessionClient } from '../../../server/auth/supabase-server';
import { getMyAiKeyState } from '../../../server/assistant/user-key';
import { currentTenantId } from '../../../server/company/company';
import { reportError } from '../../../server/errors/report';
import { reportRouteFailure } from '../../../server/errors/route-failure';
import { emit } from '../../../server/events';
import { loadProfile, saveProfile } from '../../../server/profile/profile';
import { parseProfileInput, type ProfileResponse } from '../../../lib/profile/profile';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/profile';

const fail = (status: number, code: string) =>
  Response.json({ error: { code, message_key: `error.${code}` } }, { status, headers });

export async function GET(_request: Request): Promise<Response> {
  try {
    const session = await requireApiSession();
    if (session instanceof Response) return fail(401, 'not_signed_in');
    const client = createSessionClient();
    const profile = await loadProfile(client, session);
    // EZD-5601 Step 15: the user's own AI key state, last 4 characters only (Q-0637).
    const body: ProfileResponse = {
      profile,
      captcha: captchaConfig(process.env),
      aiKey: await getMyAiKeyState(client),
    };
    return Response.json(body, { status: 200, headers });
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const session = await requireApiSession();
    if (session instanceof Response) return fail(401, 'not_signed_in');

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const parsed = parseProfileInput(raw);
    if (!parsed.ok) return fail(400, 'invalid_input');

    const client = createSessionClient();
    const saved = await saveProfile(client, {
      language: parsed.language,
      ipadDrawing: parsed.ipadDrawing,
    });

    if (saved.languageChanged) {
      // The save is committed; a dropped event does not fail it but is reported (a code only).
      let dropped: string | null = null;
      try {
        const tenantId = await currentTenantId(client);
        if (tenantId === null) dropped = 'profile_language_event_no_tenant';
        else {
          await emit(
            'user.language_changed',
            { appUserId: session.appUserId, language: saved.language },
            { tenantId, actorId: session.appUserId },
          );
        }
      } catch {
        dropped = 'profile_language_event_failed';
      }
      if (dropped !== null) {
        await reportError(new Error(dropped), { source: 'function', location: 'api.profile' });
      }
    }

    return Response.json(
      { profile: { language: saved.language, ipadDrawing: saved.ipadDrawing } },
      { status: 200, headers },
    );
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

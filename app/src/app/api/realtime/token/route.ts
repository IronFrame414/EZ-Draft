// EZD-018 Step 4 (vault/plans/EZD-018.md): the access token for the browser's Realtime socket. The auth
// cookies are httpOnly, so the browser cannot read the token itself; it reaches browser memory only, and
// the refresh token stays in the cookie. 401 when signed out or the session has ended (Q-0052 (c)); 500
// db_unavailable when the session read fails (Q-0168 (b)). Nothing is logged; never a secret.
import { requireApiSession } from '../../../../server/auth/session';
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { readPublicDbEnv } from '../../../../server/db/env';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };

const notSignedIn = () =>
  Response.json(
    { error: { code: 'not_signed_in', message_key: 'error.not_signed_in' } },
    { status: 401, headers },
  );

export async function GET(): Promise<Response> {
  try {
    const s = await requireApiSession();
    if (s instanceof Response) {
      const res = new Response(s.body, { status: s.status, headers: s.headers });
      res.headers.set('Cache-Control', 'no-store');
      return res;
    }
    const { data, error } = await createSessionClient().auth.getSession();
    if (error) throw error;
    if (!data.session) return notSignedIn();
    const { url, publishableKey } = readPublicDbEnv();
    return Response.json(
      {
        url,
        apiKey: publishableKey,
        accessToken: data.session.access_token,
        expiresAt: data.session.expires_at,
        appUserId: s.appUserId,
      },
      { status: 200, headers },
    );
  } catch {
    return Response.json(
      { error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } },
      { status: 500, headers },
    );
  }
}

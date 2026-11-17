// EZD-108 Step 8 (vault/plans/EZD-108.md Decided "Routes", "changePassword", "setPassword"; Q-0096 P6;
// Q-0412): change or set the signed-in user's own password. Every signed-in user may, for their own
// account only. Order: 401, 400 (body), then changePassword or setPassword. The body is never logged.
import { requireApiSession } from '../../../../server/auth/session';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { changePassword, setPassword } from '../../../../server/profile/password';
import { parsePasswordRequest } from '../../../../lib/profile/profile';
import { endedSessionResponse } from '../../../../server/auth/ended-session';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/profile/password';

const fail = (status: number, code: string) =>
  Response.json({ error: { code, message_key: `error.${code}` } }, { status, headers });

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireApiSession();
    if (session instanceof Response) return fail(401, 'not_signed_in');

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const req = parsePasswordRequest(raw);
    if (req === null) return fail(400, 'invalid_input');

    const result =
      req.mode === 'change' ? await changePassword(session, req) : await setPassword(session, req);
    if (result.status === 200) return Response.json(result.body, { status: 200, headers });
    return fail(result.status, result.code);
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

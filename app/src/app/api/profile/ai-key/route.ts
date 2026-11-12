// EZD-5601 Step 14 (vault/plans/EZD-5601.md "D-POST order", "D-DELETE", "D-Responses"; Q-0637; Q-0638 "Add and
// Remove act at once"; AC-EZD-5601-1, -2, -5, -6, -7, -9): add or remove the signed-in user's own Anthropic
// key. Every signed-in user may, for their own account only (Q-0638: Edit model is per project). The route
// does 401 and the body check; addUserAiKey and removeUserAiKey do the rest. The body is never logged.
import { z } from 'zod';
import { requireApiSession } from '../../../../server/auth/session';
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { addUserAiKey, removeUserAiKey } from '../../../../server/assistant/user-key';
import { reportRouteFailure } from '../../../../server/errors/route-failure';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/profile/ai-key';
const MAX_BODY = 2048;

const fail = (status: number, code: string) =>
  Response.json({ error: { code, message_key: `error.${code}` } }, { status, headers });

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireApiSession();
    if (session instanceof Response) return fail(401, 'not_signed_in');

    const text = await request.text();
    if (text.length > MAX_BODY) return fail(400, 'invalid_input');
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return fail(400, 'invalid_input');
    }
    const parsed = z.strictObject({ key: z.string() }).safeParse(raw);
    if (!parsed.success) return fail(400, 'invalid_input');

    const result = await addUserAiKey(createSessionClient(), session, parsed.data.key, {
      signal: request.signal,
    });
    if (result.status === 200) {
      return Response.json({ aiKey: { last4: result.last4 } }, { status: 200, headers });
    }
    return fail(result.status, result.code);
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

export async function DELETE(_request: Request): Promise<Response> {
  try {
    const session = await requireApiSession();
    if (session instanceof Response) return fail(401, 'not_signed_in');
    const result = await removeUserAiKey(createSessionClient(), session);
    if (result.status === 200) return Response.json({ aiKey: null }, { status: 200, headers });
    return fail(result.status, result.code);
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

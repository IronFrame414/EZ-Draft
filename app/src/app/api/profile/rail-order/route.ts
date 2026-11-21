// EZD-230 (Q-0038 "each user can set the order of the tools on the rail"; Q-0122): read and save the signed-in
// user's own rail tool order. Every signed-in user may (it is their own rail; no permission switch, as Profile).
// Order: 401, 400 (body), then the read or save. The save's SQLSTATE maps 42501 to 403 and 22023 to 400. No event.
import { requireApiSession } from '../../../../server/auth/session';
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { endedSessionResponse } from '../../../../server/auth/ended-session';
import {
  loadRailOrder,
  parseRailOrderInput,
  saveRailOrder,
} from '../../../../server/profile/rail-order';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/profile/rail-order';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function GET(): Promise<Response> {
  try {
    const session = await requireApiSession();
    if (session instanceof Response) return fail(401, 'not_signed_in');
    const order = await loadRailOrder(createSessionClient(), session);
    return Response.json({ order }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const session = await requireApiSession();
    if (session instanceof Response) return fail(401, 'not_signed_in');

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const parsed = parseRailOrderInput(raw);
    if (!parsed.ok) return fail(400, 'invalid_input');

    let order: string[];
    try {
      order = await saveRailOrder(createSessionClient(), parsed.order);
    } catch (e) {
      const code = (e as { code?: unknown }).code;
      if (code === '42501') return fail(403, 'permission_denied', 'error.not_authorized');
      if (code === '22023') return fail(400, 'invalid_input');
      throw e;
    }
    return Response.json({ order }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

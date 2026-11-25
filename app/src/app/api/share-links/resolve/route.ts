// EZD-1201 (AC-EZD-1201-1; S18 States "Expired: This link has expired. Ask [Company] to renew it."; Q-0700 03 row):
// the client link's status, for the signed-out client page (EZD-1202). POST so the token travels in the body,
// never in a URL or a log. 200 `{ link: { status: 'active', expiresAt } }`; 410 the expired response with the
// company name only; 404 for an unknown, malformed, revoked or deleted-project link. `view: true` records
// share_link.viewed (the page open).
import { z } from 'zod';
import { endedSessionResponse } from '../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { fail, SHARE_LINK_HEADERS } from '../../../../server/share-links/route-helpers';
import { resolveShareLink } from '../../../../server/share-links/share-links';

export const dynamic = 'force-dynamic';

const ROUTE = '/api/share-links/resolve';

const bodySchema = z.object({ token: z.string().max(64), view: z.boolean().optional() });

export async function POST(request: Request): Promise<Response> {
  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) return fail(400, 'invalid_input');
    const r = await resolveShareLink(parsed.data.token, { view: parsed.data.view ?? false });
    if (r.status === 'expired') {
      return Response.json(
        {
          error: { code: 'share_link_expired', message_key: 'error.share_link_expired' },
          company: r.company,
        },
        { status: 410, headers: SHARE_LINK_HEADERS },
      );
    }
    if (r.status === 'not_found') return fail(404, 'share_link_not_found');
    return Response.json(
      { link: { status: 'active', expiresAt: r.expiresAt } },
      { status: 200, headers: SHARE_LINK_HEADERS },
    );
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

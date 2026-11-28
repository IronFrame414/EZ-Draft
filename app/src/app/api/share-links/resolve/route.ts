// EZD-1201 (AC-EZD-1201-1; S18 States "Expired: This link has expired. Ask [Company] to renew it."; Q-0700 03 row):
// the client link's status, for the signed-out client page (EZD-1202). POST so the token travels in the body,
// never in a URL or a log. 200 `{ link: { status: 'active', expiresAt } }`; 410 the expired response with the
// company name only; 404 for an unknown, malformed, revoked or deleted-project link. `view: true` records
// share_link.viewed (the page open), at most once per link per hour (EZD-2006, in resolve_share_link).
// EZD-1711 (AC-EZD-1711-3; Q-0795): a link of a company locked for not paying is 404 share_link_unavailable
// ("This link isn't available.").
// EZD-2006 (AC-EZD-2006-2): every call first takes a slot of the error tunnel's per-address throttle
// (tunnelAllows, error_tunnel_take: 60 per address per rolling hour); past the limit it answers 429.
import { z } from 'zod';
import { endedSessionResponse } from '../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { tunnelAllows } from '../../../../server/errors/tunnel-throttle';
import { fail, SHARE_LINK_HEADERS } from '../../../../server/share-links/route-helpers';
import { resolveShareLink } from '../../../../server/share-links/share-links';

export const dynamic = 'force-dynamic';

const ROUTE = '/api/share-links/resolve';

const bodySchema = z.object({ token: z.string().max(64), view: z.boolean().optional() });

export async function POST(request: Request): Promise<Response> {
  try {
    if (!(await tunnelAllows(request.headers, 1))) return fail(429, 'too_many_requests');
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
    if (r.status === 'unavailable') return fail(404, 'share_link_unavailable');
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

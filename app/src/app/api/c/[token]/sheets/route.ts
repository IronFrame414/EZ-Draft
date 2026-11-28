// EZD-2032 (AC-EZD-2032-2, -3; S18 Page tab: Plans; Q-0700 03 row; 03b rule 11): the signed-out client page's Plans
// tab. 200 `{ plans }`: none, preparing, or the sent set's sheets in set order with signed links of at most
// SIGNED_DOWNLOAD_SECONDS (server/sends/client-sheets.ts; no cost data); 410 the expired answer with the company name
// only; 404 for an unknown, malformed, revoked or deleted-project link, or a locked company's link: none of them gets
// a link. Every answer is no-store, no-referrer and noindex. Like the page's own read it first takes a slot of the
// error tunnel's per-address throttle (429 past it). It reads only.
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { tunnelAllows } from '../../../../../server/errors/tunnel-throttle';
import { CLIENT_PAGE_HEADERS } from '../../../../../server/sends/client-page-headers';
import { loadClientSheets } from '../../../../../server/sends/client-sheets';

export const dynamic = 'force-dynamic';

const ROUTE = '/api/c/[token]/sheets';

const fail = (status: number, code: string) =>
  Response.json(
    { error: { code, message_key: `error.${code}` } },
    { status, headers: CLIENT_PAGE_HEADERS },
  );

export async function GET(
  request: Request,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  try {
    if (!(await tunnelAllows(request.headers, 1))) return fail(429, 'too_many_requests');
    const { token } = await ctx.params;
    const r = await loadClientSheets(token);
    if (r.status === 'expired') {
      return Response.json(
        {
          error: { code: 'share_link_expired', message_key: 'error.share_link_expired' },
          company: r.company,
        },
        { status: 410, headers: CLIENT_PAGE_HEADERS },
      );
    }
    if (r.status === 'not_found') return fail(404, 'share_link_not_found');
    if (r.status === 'unavailable') return fail(404, 'share_link_unavailable');
    return Response.json({ plans: r.plans }, { status: 200, headers: CLIENT_PAGE_HEADERS });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

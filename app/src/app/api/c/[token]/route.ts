// EZD-1202 (AC-EZD-1202-1; S18 Layout, States; Q-0700 03 row; 03b rule 11; vault/build/assumptions/EZD-1202.md
// Settled "Where the page and its data come from"): the signed-out client page's data, for the page's Try again.
// 200 `{ page }` with the fixed field list of ClientPageView (no cost data); 410 the expired answer with the company
// name only; 404 for an unknown, malformed, revoked or deleted-project link, or a locked company's link. Every
// answer is no-store, no-referrer and noindex. Like the share link lookup it first takes a slot of the error
// tunnel's per-address throttle (429 past it). It reads only; share_link.viewed is written by the page open.
import { endedSessionResponse } from '../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { tunnelAllows } from '../../../../server/errors/tunnel-throttle';
import { CLIENT_PAGE_HEADERS } from '../../../../server/sends/client-page-headers';
import { loadClientPage } from '../../../../server/sends/client-page';

export const dynamic = 'force-dynamic';

const ROUTE = '/api/c/[token]';

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
    const r = await loadClientPage(token);
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
    return Response.json({ page: r.page }, { status: 200, headers: CLIENT_PAGE_HEADERS });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

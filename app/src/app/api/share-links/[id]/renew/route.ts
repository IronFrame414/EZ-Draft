// EZD-1201 (S18 States "Contractor renews for 30 days"; AC-EZD-1201-2; Q-0700 10 row): Renew a share link.
// Order: 401, 403 (no Send to client), 404 (a malformed id, another company's link or a project out of scope),
// 409 (revoked), then 200 `{ link: { id, expiresAt, renewedAt } }`. renew_share_link checks the switch and
// scope again; the new expiry is the Defaults "Share link expiry" (30 days) from now.
import { z } from 'zod';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { requireApiPermission } from '../../../../../server/permissions';
import {
  fail,
  SHARE_LINK_HEADERS,
  shareLinkFailure,
} from '../../../../../server/share-links/route-helpers';
import { renewShareLink } from '../../../../../server/share-links/share-links';

export const dynamic = 'force-dynamic';

const ROUTE = '/api/share-links/[id]/renew';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('send_to_client');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return shareLinkFailure('not_found');
    const result = await renewShareLink(createSessionClient(), id);
    if (!result.ok) return shareLinkFailure(result.code);
    return Response.json({ link: result.link }, { status: 200, headers: SHARE_LINK_HEADERS });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

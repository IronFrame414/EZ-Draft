// EZD-1201 (11 Security "revocable"; Q-0700 10 row): turn a share link off. Once off it stays off.
// Order: 401, 403 (no Send to client), 404 (a malformed id, another company's link or a project out of scope),
// then 200 `{ link: { id, revokedAt } }` (a second revoke keeps the first time). revoke_share_link checks
// the switch and scope again. The client page then answers not found.
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
import { revokeShareLink } from '../../../../../server/share-links/share-links';

export const dynamic = 'force-dynamic';

const ROUTE = '/api/share-links/[id]/revoke';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('send_to_client');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return shareLinkFailure('not_found');
    const result = await revokeShareLink(createSessionClient(), id);
    if (!result.ok) return shareLinkFailure(result.code);
    return Response.json({ link: result.link }, { status: 200, headers: SHARE_LINK_HEADERS });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

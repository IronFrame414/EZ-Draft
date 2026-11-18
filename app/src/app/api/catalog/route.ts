// EZD-401 (S09 Permissions "View catalog drawer: View projects"; 03c catalog_item): the company catalog for the
// read-only picker. Order: 401, 403 (no View projects), then the session client (RLS: the claim tenant).
// 200 `{ items }` with no money fields.
// EZD-406 (S04 Controls "Catalog > Cost ... Hidden without See company costs"): a member with See company costs
// also gets each item's `unitCost` (the box inspector's Cost row); without it the key is never sent.
import { endedSessionResponse } from '../../../server/auth/ended-session';
import { createSessionClient } from '../../../server/auth/supabase-server';
import { listCatalogItems } from '../../../server/catalog/catalog';
import { reportRouteFailure } from '../../../server/errors/route-failure';
import { can, requireApiPermission } from '../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/catalog';

export async function GET(): Promise<Response> {
  try {
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    const items = await listCatalogItems(createSessionClient(), {
      withCost: can(p.ctx, 'see_company_costs'),
    });
    return Response.json({ items }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return Response.json(
      { error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } },
      { status: 500, headers },
    );
  }
}

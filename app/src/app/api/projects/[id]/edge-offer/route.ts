// EZD-417 (S04b Controls "Offered profile rows | ... the price difference as a total for this top | Price hidden
// without See sell prices", "Edit offered edges | Choose which profiles the client sees and enter the price
// difference per lf ... | Requires Send to client"; S04b Events emitted "edge_profile.offered"; 13b R2;
// vault/build/assumptions.md EZD-417): a project's edge profile offers, one per top.
// GET: 401, 404 (a malformed id), 403 / 404 (no View projects, project out of scope), then 200 `{ offers }`; each
//   choice carries `ratePerLf` only with See sell prices.
// PUT `{ pieceId, choices: [{ profileId, ratePerLf? }] }`: 401, 404, 403 / 404 (no Send to client, out of scope),
//   400 (bad JSON, a body not of that shape, an unknown profile), then save_edge_offer under the member's session
//   (it checks the switch and scope again). Without See sell prices the rates sent are ignored: saved rates are kept
//   and a new choice gets 0. An empty list withdraws the offer. 200 `{ offer }` (null when withdrawn).
import { z } from 'zod';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { listEdgeOffers, saveEdgeOffer } from '../../../../../server/countertops/edge-profiles';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { can, requireApiPermission, requirePermission } from '../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/edge-offer';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

// Dollars per LF to the cent, 0 (included) up to 99,999.99.
const rateSchema = z
  .number()
  .min(0)
  .max(99999.99)
  .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6);

const bodySchema = z
  .object({
    pieceId: z.uuid(),
    choices: z
      .array(z.object({ profileId: z.uuid(), ratePerLf: rateSchema.optional() }).strict())
      .max(7),
  })
  .strict();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'view_projects', { projectId: id });
    if (denied) return denied;
    const offers = await listEdgeOffers(createSessionClient(), id, can(p.ctx, 'see_sell_prices'));
    if (offers === null) return fail(404, 'project_not_found');
    return Response.json({ offers }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('send_to_client');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'send_to_client', { projectId: id });
    if (denied) return denied;

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const body = bodySchema.safeParse(raw);
    if (!body.success) return fail(400, 'invalid_input');

    const result = await saveEdgeOffer(
      createSessionClient(),
      { projectId: id, pieceId: body.data.pieceId, choices: body.data.choices },
      can(p.ctx, 'see_sell_prices'),
    );
    if (!result.ok) {
      if (result.code === 'permission_denied') return fail(403, 'permission_denied', 'error.not_authorized');
      if (result.code === 'invalid_input') return fail(400, 'invalid_input');
      return fail(404, 'project_not_found');
    }
    return Response.json({ offer: result.offer }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

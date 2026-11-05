// EZD-113 Steps 10 (vault/plans/EZD-113.md Decided "List route", "Create route", "Error bodies"; S15a
// Customers, Events; Q-0227; Q-0232): list one page of customers and add a customer. Order: 401, 403 (no
// Company settings switch), 400 (query or body), then the session client (RLS: the claim tenant). A
// duplicate email in the company is 400 `customer_email_taken`. `customer.created` is emitted after the
// insert; a failed emit does not fail the save.
// EZD-118 Build step 7 (vault/plans/EZD-118.md Decided "Customers GET", "Customers POST"; Q-0400; Q-0414):
// Company settings or Create projects opens both; the archived list stays with Company settings (Q-0227).
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { currentTenantId } from '../../../../server/company/company';
import {
  CUSTOMER_COLUMNS,
  isEmailTaken,
  listCustomers,
  parseCustomerInput,
  parseListQuery,
  toCustomer,
} from '../../../../server/customers/customers';
import { errorType } from '../../../../server/errors/fingerprint';
import { reportError } from '../../../../server/errors/report';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { emit } from '../../../../server/events';
import { can, requireApiPermission } from '../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/settings/customers';
const EMIT_FAILED = 'customer_created_event_failed';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function GET(request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission(['settings_company', 'create_projects']);
    if (p instanceof Response) return p;
    const query = parseListQuery(new URL(request.url).searchParams);
    if (query === null) return fail(400, 'invalid_input');
    if (query.archived && !can(p.ctx, 'settings_company')) {
      return fail(403, 'permission_denied', 'error.not_authorized');
    }
    const page = await listCustomers(createSessionClient(), query);
    return Response.json(page, { status: 200, headers });
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission(['settings_company', 'create_projects']);
    if (p instanceof Response) return p;

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const parsed = parseCustomerInput(raw);
    if (!parsed.ok) return fail(400, parsed.code);

    const client = createSessionClient();
    const tenantId = await currentTenantId(client);
    if (tenantId === null) return fail(403, 'permission_denied', 'error.not_authorized');

    const { data, error } = await client
      .from('customer')
      .insert({ tenant_id: tenantId, ...parsed.value })
      .select(CUSTOMER_COLUMNS)
      .single();
    if (error) {
      if (isEmailTaken(error)) return fail(400, 'customer_email_taken');
      throw error;
    }

    try {
      await emit(
        'customer.created',
        { customerId: data.id },
        { tenantId, actorId: p.session.appUserId },
      );
    } catch (e) {
      // The insert is committed; a failed emit does not fail the save.
      await reportError(new Error(EMIT_FAILED), {
        source: 'function',
        location: ROUTE,
        tags: { 'ezd.cause': errorType(e) },
      });
    }

    return Response.json({ customer: toCustomer(data) }, { status: 201, headers });
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

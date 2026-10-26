// EZD-113 Step 11 (vault/plans/EZD-113.md Decided "Change route", "Error bodies"; S15a Customers, Events;
// Q-0227): edit, archive or restore one customer. Order: 401, 403 (no Company settings switch), 404 for a
// malformed id, 400 (body), 404 when no visible row (another company's customer included), then the write.
// Nothing changed is 200 with no write and no event. There is no delete (Q-0227).
import { z } from 'zod';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { currentTenantId } from '../../../../../server/company/company';
import {
  CUSTOMER_COLUMNS,
  changedFields,
  isEmailTaken,
  parseCustomerPatch,
  toCustomer,
} from '../../../../../server/customers/customers';
import type { Database } from '../../../../../server/db/database.types';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { emit } from '../../../../../server/events';
import { requireApiPermission } from '../../../../../server/permissions';
import type { CustomerEventField } from '../../../../../lib/customers/customers';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/settings/customers/[id]';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const p = await requireApiPermission('settings_company');
    if (p instanceof Response) return p;
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return fail(404, 'customer_not_found');

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const parsed = parseCustomerPatch(raw);
    if (!parsed.ok) return fail(400, parsed.code);

    const client = createSessionClient();
    const { data: row, error: readError } = await client
      .from('customer')
      .select(CUSTOMER_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (readError) throw readError;
    if (!row) return fail(404, 'customer_not_found');
    const before = toCustomer(row);

    let fields: CustomerEventField[];
    let update: Database['public']['Tables']['customer']['Update'];
    if (parsed.value.kind === 'edit') {
      fields = changedFields(before, parsed.value.values);
      update = parsed.value.values;
    } else {
      const archived = parsed.value.archived;
      fields = archived !== (before.archivedAt !== null) ? ['archived'] : [];
      update = { archived_at: archived ? new Date().toISOString() : null };
    }
    if (fields.length === 0) return Response.json({ customer: before }, { status: 200, headers });

    const { data, error } = await client
      .from('customer')
      .update(update)
      .eq('id', id)
      .select(CUSTOMER_COLUMNS)
      .single();
    if (error) {
      if (isEmailTaken(error)) return fail(400, 'customer_email_taken');
      throw error;
    }

    try {
      // The event's company is the claim tenant, read as the create route reads it.
      const tenantId = await currentTenantId(client);
      if (tenantId === null) throw new Error('customer_tenant_missing');
      await emit(
        'customer.updated',
        { customerId: id, fields },
        { tenantId, actorId: p.session.appUserId },
      );
    } catch {
      // The update is committed; a failed emit does not fail the save.
    }

    return Response.json({ customer: toCustomer(data) }, { status: 200, headers });
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

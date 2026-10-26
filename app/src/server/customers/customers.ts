// EZD-113 Step 9 (vault/plans/EZD-113.md Decided "Input parsing", "List query", "`listCustomers`",
// "`isEmailTaken`", "Change route"; S15a Customers; Q-0227): server-only helpers for the Customers list.
// Reads go through the caller's session client (RLS: the claim tenant; project counts by the viewer's scope).
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  CUSTOMER_FIELDS,
  CUSTOMER_PAGE_SIZE,
  type Customer,
  type CustomerField,
  type CustomerPage,
} from '../../lib/customers/customers';
import type { Database } from '../db/database.types';

export type CustomerCode =
  'invalid_input' | 'customer_name_required' | 'customer_email_required' | 'invalid_email';

export type CustomerValues = {
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
};

const text = z.string().max(1000);
const inputSchema = z.strictObject({ name: text, email: text, phone: text, address: text });
const archiveSchema = z.strictObject({ archived: z.boolean() });

type Parsed<T> = { ok: true; value: T } | { ok: false; code: CustomerCode };

export function parseCustomerInput(body: unknown): Parsed<CustomerValues> {
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, code: 'invalid_input' };
  const name = parsed.data.name.trim();
  const email = parsed.data.email.trim();
  const phone = parsed.data.phone.trim();
  const address = parsed.data.address.trim();
  if (name === '') return { ok: false, code: 'customer_name_required' };
  if (email === '') return { ok: false, code: 'customer_email_required' };
  if (!z.email().safeParse(email).success) return { ok: false, code: 'invalid_email' };
  return {
    ok: true,
    value: {
      name,
      email,
      phone: phone === '' ? null : phone,
      address: address === '' ? null : address,
    },
  };
}

export function parseCustomerPatch(
  body: unknown,
): Parsed<{ kind: 'edit'; values: CustomerValues } | { kind: 'archive'; archived: boolean }> {
  const archive = archiveSchema.safeParse(body);
  if (archive.success)
    return { ok: true, value: { kind: 'archive', archived: archive.data.archived } };
  const edit = parseCustomerInput(body);
  if (!edit.ok) return edit;
  return { ok: true, value: { kind: 'edit', values: edit.value } };
}

export type ListQuery = { q: string; archived: boolean; page: number };

const PAGE_PATTERN = /^[1-9][0-9]{0,5}$/;

export function parseListQuery(params: URLSearchParams): ListQuery | null {
  const q = (params.get('q') ?? '').trim();
  if (q.length > 1000) return null;
  const archivedRaw = params.get('archived');
  let archived: boolean;
  if (archivedRaw === null || archivedRaw === '0') archived = false;
  else if (archivedRaw === '1') archived = true;
  else return null;
  const pageRaw = params.get('page');
  let page = 1;
  if (pageRaw !== null) {
    if (!PAGE_PATTERN.test(pageRaw)) return null;
    page = Number(pageRaw);
  }
  return { q, archived, page };
}

const rowSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  archivedAt: z.string().nullable(),
  projectCount: z.number().int().nonnegative(),
});
const listSchema = z.object({
  rows: z.array(rowSchema),
  total: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  archived: z.number().int().nonnegative(),
});

export async function listCustomers(
  client: SupabaseClient<Database>,
  query: ListQuery,
): Promise<CustomerPage> {
  const { data, error } = await client.rpc('list_customers', {
    p_search: query.q,
    p_archived: query.archived,
    p_page: query.page,
  });
  if (error) throw error;
  const parsed = listSchema.safeParse(data);
  if (!parsed.success) throw new Error('list_customers_bad_result');
  const { rows, total, active, archived } = parsed.data;
  return { rows, total, active, archived, page: query.page, pageSize: CUSTOMER_PAGE_SIZE };
}

export const CUSTOMER_COLUMNS = 'id, name, email, phone, address, archived_at';

export function toCustomer(row: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  archived_at: string | null;
}): Customer {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    archivedAt: row.archived_at,
  };
}

export function changedFields(before: Customer, values: CustomerValues): CustomerField[] {
  return CUSTOMER_FIELDS.filter((field) => before[field] !== values[field]);
}

export function isEmailTaken(error: { code?: string; message?: string } | null): boolean {
  return (
    error !== null &&
    error.code === '23505' &&
    (error.message ?? '').includes('customer_tenant_email_key')
  );
}

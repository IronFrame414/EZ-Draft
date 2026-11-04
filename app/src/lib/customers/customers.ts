// EZD-113 Step 8 (vault/plans/EZD-113.md Decided "Fields", "Page size", "Dialog save"; S15a Customers): the
// customer types and the draft check shared by the browser and the server. No React, no Supabase.

export const CUSTOMER_PAGE_SIZE = 50;
export const CUSTOMER_FIELDS = ['name', 'email', 'phone', 'address'] as const;
export type CustomerField = (typeof CUSTOMER_FIELDS)[number];
export type CustomerEventField = CustomerField | 'archived';

export type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  archivedAt: string | null;
};

export type CustomerRow = Customer & { projectCount: number };

export type CustomerPage = {
  rows: CustomerRow[];
  total: number;
  active: number;
  archived: number;
  page: number;
  pageSize: number;
};

export type CustomerCounts = { active: number; archived: number };

export type CustomerDraft = { name: string; email: string; phone: string; address: string };

export type DraftProblem = 'customer_name_required' | 'customer_email_required';

export function checkCustomerDraft(d: CustomerDraft): {
  name?: DraftProblem;
  email?: DraftProblem;
} {
  const problems: { name?: DraftProblem; email?: DraftProblem } = {};
  if (d.name.trim() === '') problems.name = 'customer_name_required';
  if (d.email.trim() === '') problems.email = 'customer_email_required';
  return problems;
}

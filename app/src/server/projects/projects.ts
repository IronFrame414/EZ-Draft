// EZD-117a Step 5 (vault/plans/EZD-117a.md Decided "Query params", "Cursor", "listProjects", "countProjects";
// S01 Controls, Data shown): server-only helpers for the Projects page. Reads go through the caller's session
// client (RLS: the claim tenant and the viewer's scope), one rpc each, never `.from()`.
// EZD-117b Build step 4 (vault/plans/EZD-117b.md Decided "parseProjectSearch", "RPC args"): the `q` search;
// an empty search is never sent as `p_search`.
// EZD-118 Build step 4 (vault/plans/EZD-118.md Decided "`parseNewProject`", "`createProject`"; Q-0396): the New
// project body and the one write, `public.create_project` (M1), through the caller's session client.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  PROJECT_SEARCH_MAX,
  PROJECT_SORTS,
  PROJECT_STATUSES,
  PROJECT_TABS,
  type ProjectCounts,
  type ProjectPage,
  type ProjectSort,
  type ProjectTab,
} from '../../lib/projects/projects';
import {
  PROJECT_ADDRESS_MAX,
  PROJECT_NAME_MAX,
  PROJECT_TYPES,
  SCOPE_OF_WORK_MAX,
  type ProjectType,
} from '../../lib/projects/new-project';
import type { Database } from '../db/database.types';

export type ProjectCursor = {
  id: string;
  u: string;
  n: string;
  m: boolean;
  c: string;
  r: number;
  o: number;
};

export type ProjectListQuery = { tab: ProjectTab; sort: ProjectSort; after: ProjectCursor | null };

// Every cursor this schema accepts is accepted by PostgreSQL's casts in M1 (plan Decided "Cursor"):
// `u` at most 32 characters, no year 0000, offsets within +-15:59, text well-formed without U+0000,
// `o` within integer.
const pgKey = z
  .string()
  .max(1000)
  .refine((v) => v.isWellFormed() && !v.includes('\u0000'));
const pgTimestamp = (v: string): boolean =>
  !v.startsWith('0000') && !/[+-](1[6-9]|2\d):\d\d$/.test(v);

const cursorSchema = z.strictObject({
  id: z.uuid(),
  u: z.iso.datetime({ offset: true }).max(32).refine(pgTimestamp),
  n: pgKey,
  m: z.boolean(),
  c: pgKey,
  r: z.number().int().min(1).max(5),
  o: z.number().int().min(0).max(2147483647),
});

const CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/;

export function encodeCursor(c: ProjectCursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

export function decodeCursor(s: string): ProjectCursor | null {
  if (s.length > 8200 || !CURSOR_PATTERN.test(s)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const parsed = cursorSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

const isTab = (v: string): v is ProjectTab => (PROJECT_TABS as readonly string[]).includes(v);
const isSort = (v: string): v is ProjectSort => (PROJECT_SORTS as readonly string[]).includes(v);

export function parseProjectListQuery(params: URLSearchParams): ProjectListQuery | null {
  const status = params.get('status');
  const sort = params.get('sort');
  const afterRaw = params.get('after');
  let tab: ProjectTab = 'all';
  if (status !== null) {
    if (!isTab(status)) return null;
    tab = status;
  }
  let order: ProjectSort = 'edited';
  if (sort !== null) {
    if (!isSort(sort)) return null;
    order = sort;
  }
  let after: ProjectCursor | null = null;
  if (afterRaw !== null) {
    after = decodeCursor(afterRaw);
    if (after === null) return null;
  }
  return { tab, sort: order, after };
}

export function parseProjectSearch(params: URLSearchParams): string | null {
  const search = (params.get('q') ?? '').trim();
  return search.length > PROJECT_SEARCH_MAX ? null : search;
}

const pageSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      clientName: z.string().nullable(),
      address: z.string(),
      status: z.enum(PROJECT_STATUSES),
      openItems: z.number().int().nonnegative(),
    }),
  ),
  next: cursorSchema.nullable(),
});

const countsSchema = z.strictObject({
  all: z.number().int().nonnegative(),
  draft: z.number().int().nonnegative(),
  client_review: z.number().int().nonnegative(),
  permit_submitted: z.number().int().nonnegative(),
  approved: z.number().int().nonnegative(),
  in_build: z.number().int().nonnegative(),
});

export async function listProjects(
  client: SupabaseClient<Database>,
  q: ProjectListQuery,
  search?: string,
): Promise<ProjectPage> {
  const { data, error } = await client.rpc('list_projects', {
    p_sort: q.sort,
    ...(q.tab === 'all' ? {} : { p_status: q.tab }),
    ...(q.after === null ? {} : { p_after: q.after }),
    ...(search ? { p_search: search } : {}),
  });
  if (error) throw error;
  const parsed = pageSchema.safeParse(data);
  if (!parsed.success) throw new Error('list_projects_bad_result');
  const { items, next } = parsed.data;
  return { items, next: next === null ? null : encodeCursor(next) };
}

export async function countProjects(
  client: SupabaseClient<Database>,
  search?: string,
): Promise<ProjectCounts> {
  const { data, error } = search
    ? await client.rpc('count_projects', { p_search: search })
    : await client.rpc('count_projects');
  if (error) throw error;
  const parsed = countsSchema.safeParse(data);
  if (!parsed.success) throw new Error('count_projects_bad_result');
  return parsed.data;
}

export type NewProjectValues = {
  name: string;
  address: string;
  type: ProjectType;
  customerId: string | null;
  scopeOfWork: string | null;
};

const newProjectSchema = z.strictObject({
  name: z.string().max(PROJECT_NAME_MAX),
  address: z.string().max(PROJECT_ADDRESS_MAX),
  type: z.enum(PROJECT_TYPES),
  customerId: z.uuid().nullable(),
  scopeOfWork: z.string().max(SCOPE_OF_WORK_MAX),
});

export function parseNewProject(body: unknown): NewProjectValues | null {
  const parsed = newProjectSchema.safeParse(body);
  if (!parsed.success) return null;
  const name = parsed.data.name.trim();
  const address = parsed.data.address.trim();
  const scope = parsed.data.scopeOfWork.trim();
  if (name === '' || address === '') return null;
  return {
    name,
    address,
    type: parsed.data.type,
    customerId: parsed.data.customerId,
    scopeOfWork: scope === '' ? null : scope,
  };
}

export type CreateProjectResult =
  | { ok: true; projectId: string; tenantId: string }
  | { ok: false; code: 'permission_denied' | 'invalid_input' | 'customer_unavailable' };

type CreateProjectArgs = Database['public']['Functions']['create_project']['Args'];

export async function createProject(
  client: SupabaseClient<Database>,
  v: NewProjectValues,
): Promise<CreateProjectResult> {
  // The generated Args type marks every argument non-null; the function takes a null customer and scope.
  const args = {
    p_name: v.name,
    p_address: v.address,
    p_type: v.type,
    p_customer_id: v.customerId,
    p_scope_of_work: v.scopeOfWork,
  } as unknown as CreateProjectArgs;
  const { data, error } = await client.rpc('create_project', args);
  if (error) {
    if (error.code === '42501') return { ok: false, code: 'permission_denied' };
    if (error.code === '22023') {
      return error.message.includes('customer_unavailable')
        ? { ok: false, code: 'customer_unavailable' }
        : { ok: false, code: 'invalid_input' };
    }
    throw error;
  }
  const row = data?.[0];
  if (!row) throw new Error('create_project_no_row');
  return { ok: true, projectId: row.project_id, tenantId: row.tenant_id };
}

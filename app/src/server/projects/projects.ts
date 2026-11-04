// EZD-117a Step 5 (vault/plans/EZD-117a.md Decided "Query params", "Cursor", "listProjects", "countProjects";
// S01 Controls, Data shown): server-only helpers for the Projects page. Reads go through the caller's session
// client (RLS: the claim tenant and the viewer's scope), one rpc each, never `.from()`.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  PROJECT_SORTS,
  PROJECT_STATUSES,
  PROJECT_TABS,
  type ProjectCounts,
  type ProjectPage,
  type ProjectSort,
  type ProjectTab,
} from '../../lib/projects/projects';
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
): Promise<ProjectPage> {
  const { data, error } = await client.rpc('list_projects', {
    p_sort: q.sort,
    ...(q.tab === 'all' ? {} : { p_status: q.tab }),
    ...(q.after === null ? {} : { p_after: q.after }),
  });
  if (error) throw error;
  const parsed = pageSchema.safeParse(data);
  if (!parsed.success) throw new Error('list_projects_bad_result');
  const { items, next } = parsed.data;
  return { items, next: next === null ? null : encodeCursor(next) };
}

export async function countProjects(client: SupabaseClient<Database>): Promise<ProjectCounts> {
  const { data, error } = await client.rpc('count_projects');
  if (error) throw error;
  const parsed = countsSchema.safeParse(data);
  if (!parsed.success) throw new Error('count_projects_bad_result');
  return parsed.data;
}

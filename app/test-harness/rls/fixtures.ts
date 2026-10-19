// EZD-006 Step 7 (vault/plans/EZD-006.md): fixtures for the RLS tests. Every row carries a per-module
// random suffix; cleanup() deletes what this module created (tests share one local database, Q-0019).
// Sign-in uses the Auth admin API (generateLink + verifyOtp): no email is sent, no EZD-007 code.
// serverDb sends the gate header as a server route does (Step 1b; Q-0087); browserDb does not.
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { adminSql, type Sql, type TransactionSql, withRollback } from './db';

export const GATE_HEADER = 'x-ezd-api-gate';

export type Scope = 'all' | 'listed';
export type MembershipStatus = 'invited' | 'active' | 'deactivated';

export type Member = {
  appUserId: string;
  authUserId: string;
  membershipId: string;
  email: string;
};

export type Session = {
  accessToken: string;
  refreshToken: string;
  serverDb: SupabaseClient;
  browserDb: SupabaseClient;
};

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const publishable = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string;
const secret = () => process.env.SUPABASE_SECRET_KEY as string;
export const gateSecret = () => process.env.SUPABASE_API_GATE_SECRET as string;

const runSuffix = randomUUID().slice(0, 8);
let emailN = 0;
let tenantN = 0;

const created = {
  tenantIds: [] as string[],
  authUserIds: [] as string[],
  appUserIds: [] as string[],
};

let admin: SupabaseClient | undefined;
let sql: Sql | undefined;

export function adminDb(): SupabaseClient {
  admin ??= createClient(url(), secret(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

export function harnessSql(): Sql {
  sql ??= adminSql();
  return sql;
}

export const nextEmail = () => `ezd006-${runSuffix}-${++emailN}@example.com`;
export const tenantName = () => `EZD-006 test ${runSuffix} ${++tenantN}`;

function clientWithHeaders(headers: Record<string, string>): SupabaseClient {
  return createClient(url(), publishable(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers },
  });
}

type Row = Record<string, unknown>;

async function insertOne(table: string, row: Row): Promise<Row & { id: string }> {
  const { data, error } = await adminDb().from(table).insert(row).select('*').single();
  if (error) throw new Error(`fixture insert into ${table} failed: ${error.code} ${error.message}`);
  return data as Row & { id: string };
}

export async function createTenant(): Promise<string> {
  const row = await insertOne('tenant', { name: tenantName() });
  const id = row.id as string;
  created.tenantIds.push(id);
  return id;
}

export async function createProjects(tenantId: string, n: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 1; i <= n; i++) {
    const row = await insertOne('project', {
      tenant_id: tenantId,
      name: `Project ${runSuffix} ${i}`,
      address: `${i} Test St ${runSuffix}`,
      type: 'kitchen',
    });
    ids.push(row.id as string);
  }
  return ids;
}

export async function createAppUser(): Promise<{
  appUserId: string;
  authUserId: string;
  email: string;
}> {
  const email = nextEmail();
  const { data, error } = await adminDb().auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw new Error(`auth createUser failed: ${error?.message}`);
  created.authUserIds.push(data.user.id);
  const row = await insertOne('app_user', { email, auth_user_id: data.user.id });
  created.appUserIds.push(row.id as string);
  return { appUserId: row.id as string, authUserId: data.user.id, email };
}

export async function createMember(opts: {
  tenantId: string;
  scope: Scope;
  status?: MembershipStatus;
  listed?: string[];
}): Promise<Member> {
  const { tenantId, scope, status = 'active', listed = [] } = opts;
  const person = await createAppUser();
  const membership = await insertOne('membership', {
    tenant_id: tenantId,
    user_id: person.appUserId,
    status,
    scope,
  });
  const membershipId = membership.id as string;
  for (const projectId of listed) {
    await insertOne('membership_project', {
      tenant_id: tenantId,
      membership_id: membershipId,
      project_id: projectId,
    });
  }
  return { ...person, membershipId };
}

// An auth user with no app_user row (T8 (a)).
export async function createUnlinkedAuthUser(): Promise<{ authUserId: string; email: string }> {
  const email = nextEmail();
  const { data, error } = await adminDb().auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw new Error(`auth createUser failed: ${error?.message}`);
  created.authUserIds.push(data.user.id);
  return { authUserId: data.user.id, email };
}

export async function signIn(email: string): Promise<Session> {
  const { data: link, error: linkError } = await adminDb().auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError || !link.properties) throw new Error(`generateLink failed: ${linkError?.message}`);
  const verifier = clientWithHeaders({});
  const { data, error } = await verifier.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (error || !data.session) throw new Error(`verifyOtp failed: ${error?.message}`);
  const accessToken = data.session.access_token;
  const refreshToken = data.session.refresh_token;
  return {
    accessToken,
    refreshToken,
    serverDb: sessionClient(accessToken, gateSecret()),
    browserDb: sessionClient(accessToken),
  };
}

// A client holding a user's token; with `gate` it also sends the server header (a wrong value is T22 (e)).
export function sessionClient(accessToken: string, gate?: string): SupabaseClient {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (gate !== undefined) headers[GATE_HEADER] = gate;
  return clientWithHeaders(headers);
}

export function anonDb(opts: { gate: boolean }): SupabaseClient {
  return clientWithHeaders(opts.gate ? { [GATE_HEADER]: gateSecret() } : {});
}

// The JWT payload, base64url-decoded, not verified.
export function claimsOf(accessToken: string): Record<string, unknown> {
  const payload = accessToken.split('.')[1] ?? '';
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
}

export async function sessionCount(authUserId: string): Promise<number> {
  const rows = await harnessSql()`
    select count(*)::int as n from auth.sessions where user_id = ${authUserId}::uuid`;
  return rows[0].n as number;
}

// One rolled-back transaction as role authenticated with the token's claims (Step 7).
export async function asClaims<T>(
  accessToken: string,
  fn: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  const claims = JSON.stringify(claimsOf(accessToken));
  return withRollback(harnessSql(), async (tx) => {
    await tx.unsafe('set local role authenticated');
    await tx`select set_config('request.jwt.claims', ${claims}, true)`;
    return fn(tx);
  });
}

export async function cleanup(): Promise<void> {
  await cleanupCreated({
    tenantIds: [...created.tenantIds],
    authUserIds: [...created.authUserIds],
    appUserIds: [...created.appUserIds],
  });
}

export type CreatedRefs = { tenantIds: string[]; authUserIds: string[]; appUserIds: string[] };

// Deletes the given rows (and only those) in dependency order; used by cleanup() and by the isolation
// helper's own afterAll so one describe never removes another's fixtures early.
export async function cleanupCreated(refs: CreatedRefs): Promise<void> {
  const s = harnessSql();
  if (refs.tenantIds.length) {
    await s`delete from public.membership where tenant_id = any(${refs.tenantIds}::uuid[])`;
    await s`delete from public.project where tenant_id = any(${refs.tenantIds}::uuid[])`;
    await s`delete from public.tenant where id = any(${refs.tenantIds}::uuid[])`;
  }
  if (refs.appUserIds.length) {
    await s`delete from public.membership where user_id = any(${refs.appUserIds}::uuid[])`;
    await s`delete from public.app_user where id = any(${refs.appUserIds}::uuid[])`;
  }
  for (const id of refs.authUserIds) await adminDb().auth.admin.deleteUser(id);
  for (const key of ['tenantIds', 'authUserIds', 'appUserIds'] as const) {
    const gone = new Set(refs[key]);
    const keep = created[key].filter((id) => !gone.has(id));
    created[key].length = 0;
    created[key].push(...keep);
  }
}

// Position in the module's created lists; since(mark) returns what was created after it, so a nested
// describe (isolation.ts) can clean up exactly its own rows.
export type CreatedMark = { tenantIds: number; authUserIds: number; appUserIds: number };

export function marker(): CreatedMark {
  return {
    tenantIds: created.tenantIds.length,
    authUserIds: created.authUserIds.length,
    appUserIds: created.appUserIds.length,
  };
}

export function since(mark: CreatedMark): CreatedRefs {
  return {
    tenantIds: created.tenantIds.slice(mark.tenantIds),
    authUserIds: created.authUserIds.slice(mark.authUserIds),
    appUserIds: created.appUserIds.slice(mark.appUserIds),
  };
}

export async function closeHarness(): Promise<void> {
  if (sql) await sql.end({ timeout: 5 });
  sql = undefined;
}

export const sortedIds = (rows: { id?: unknown }[] | null | undefined): string[] =>
  (rows ?? []).map((r) => String(r.id)).sort();

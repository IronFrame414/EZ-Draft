// EZD-125 (test-only): the lock route tests' sign-in and call, as app/src/app/api/projects/[id]/checkpoints/route.test.ts
// signs in (a magic link verified into a cookie store, which the test's next/headers mock serves).
import { setPermissions } from '../permissions/grant';
import {
  adminDb,
  createMember,
  harnessSql,
  type Member,
} from '../rls/fixtures';
import { createSessionClient, type SessionCookieJar } from '../../src/server/auth/supabase-server';
import type { PermissionKey } from '../../src/lib/permissions/catalog';

function jarOver(store: Map<string, string>): SessionCookieJar {
  return {
    getAll: () => [...store].map(([name, value]) => ({ name, value })),
    set: (name, value, options) => {
      if (value === '' || options?.maxAge === 0) store.delete(name);
      else store.set(name, value);
    },
    isHttps: () => false,
  };
}

export async function cookiesFor(email: string): Promise<Map<string, string>> {
  const { data: link, error: linkError } = await adminDb().auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError || !link.properties) throw new Error(`generateLink failed: ${linkError?.message}`);
  const store = new Map<string, string>();
  const { error } = await createSessionClient(jarOver(store)).auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (error) throw new Error(`verifyOtp failed: ${error.message}`);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return store;
}

export type RoutePerson = { member: Member; cookies: Map<string, string>; name: string };

export async function routePerson(
  tenant: string,
  name: string,
  perms: readonly PermissionKey[],
): Promise<RoutePerson> {
  const member = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, member.membershipId, [...perms]);
  await harnessSql()`update public.app_user set name = ${name} where id = ${member.appUserId}::uuid`;
  return { member, cookies: await cookiesFor(member.email), name };
}

type Handler = (request: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

export async function callRoute(
  handler: Handler,
  o: { path: string; id: string; method: string; body?: unknown; headers?: Record<string, string> },
): Promise<{ status: number; json: unknown }> {
  const res = await handler(
    new Request(`http://localhost${o.path}`, {
      method: o.method,
      headers: { 'content-type': 'application/json', ...(o.headers ?? {}) },
      body:
        o.body === undefined
          ? undefined
          : typeof o.body === 'string'
            ? o.body
            : JSON.stringify(o.body),
    }),
    { params: Promise.resolve({ id: o.id }) },
  );
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep the text */
  }
  expect200Headers(res);
  return { status: res.status, json };
}

function expect200Headers(res: Response): void {
  if (res.headers.get('cache-control') !== 'no-store')
    throw new Error('lock route answered without no-store');
}

export const lockRows = async (project: string) =>
  (
    await harnessSql()<{ lock_epoch: string; holder_app_user_id: string | null }[]>`
      select lock_epoch, holder_app_user_id from public.edit_lock where project_id = ${project}::uuid`
  )[0];

export const backdateRequests = (project: string) =>
  harnessSql()`update public.edit_request
    set requested_at = requested_at - interval '1 day', deadline_at = now() - interval '1 second'
    where project_id = ${project}::uuid and response is null`;

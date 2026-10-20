// EZD-007c Step 3 (vault/plans/EZD-007c.md): the only session client server code uses to reach
// Supabase. Every PostgREST request carries the API gate header (Q-0087 (ii); EZD-006 request gate).
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';
import type { Database } from '../db/database.types';
import { readPublicDbEnv, serverGateSecret } from '../db/env';

export const API_GATE_HEADER = 'x-ezd-api-gate';

// Q-0048 (a): 400 days = 400 x 86,400 s.
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 34560000,
} as const;

export type SessionCookieJar = {
  getAll(): { name: string; value: string }[] | Promise<{ name: string; value: string }[]>;
  set(name: string, value: string, options: CookieOptions): void | Promise<void>;
  isHttps(): boolean | Promise<boolean>;
};

// Default jar over next/headers. Next.js refuses cookie writes from a Server Component; that write is
// dropped here because EZD-007d's request gate writes the refresh before the page renders (C3).
const nextHeadersJar: SessionCookieJar = {
  async getAll() {
    return (await cookies()).getAll();
  },
  async set(name, value, options) {
    try {
      (await cookies()).set(name, value, options);
    } catch {
      // Server Component: cookies are read-only here (C3).
    }
  },
  async isHttps() {
    const proto = (await headers()).get('x-forwarded-proto');
    return (proto ?? '').split(',')[0].trim() === 'https';
  },
};

export function createSessionClient(
  jar: SessionCookieJar = nextHeadersJar,
): SupabaseClient<Database> {
  const { url, publishableKey } = readPublicDbEnv();
  const secret = serverGateSecret();
  return createServerClient<Database>(url, publishableKey, {
    global: { headers: { [API_GATE_HEADER]: secret } },
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll: () => jar.getAll(),
      setAll: async (toSet) => {
        const secure = await jar.isHttps();
        for (const { name, value, options } of toSet) {
          await jar.set(name, value, {
            ...options,
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            secure,
          });
        }
      },
    },
  });
}

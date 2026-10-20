// EZD-016a Step 3 (vault/plans/EZD-016a.md): read the signed-in browser's session in Node only. The
// Supabase auth cookie is httpOnly, and Playwright's context.cookies() returns it. Cookie names and chunks
// follow pinned @supabase/ssr 0.12.7 (`dist/main/utils/chunker.js` lines 8, 63: `${key}.${i}`;
// `dist/main/cookies.js` lines 9, 37-50: `base64-` prefix, base64url JSON). Claims are decoded, not
// verified, as EZD-006 claimsOf does. serverDb sends the gate header (server-route path); browserDb does
// not, so PostgREST refuses it (Q-0087 (ii)). Neither ever reaches the browser.
import type { BrowserContext } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { claimsOf, gateSecret, sessionClient } from '../rls/fixtures';

export type SessionClaims = {
  sub: string;
  email: string;
  session_id: string;
  app_user_id?: string;
  tenant_id?: string;
  membership_id?: string;
  project_scope?: 'all' | 'listed';
};

const ORIGIN = 'http://127.0.0.1:3000';
const AUTH_COOKIE = /^sb-.+-auth-token(\.(0|[1-9]\d*))?$/;

export async function sessionAccessToken(context: BrowserContext): Promise<string> {
  const cookies = (await context.cookies(ORIGIN)).filter(
    (c) => AUTH_COOKIE.test(c.name) && c.value !== '',
  );
  let raw: string | undefined = cookies.find((c) => !/\.\d+$/.test(c.name))?.value;
  if (raw === undefined) {
    const chunks = cookies
      .map((c) => ({ i: Number(c.name.slice(c.name.lastIndexOf('.') + 1)), v: c.value }))
      .sort((a, b) => a.i - b.i);
    // Chunks are .0, .1, ... with no gap.
    if (chunks.length > 0 && chunks.every((c, n) => c.i === n)) {
      raw = chunks.map((c) => c.v).join('');
    }
  }
  if (raw === undefined) throw new Error('no session cookie');
  // With the `base64-` prefix the rest is base64url JSON; without it the value is the JSON itself.
  const json = raw.startsWith('base64-')
    ? Buffer.from(raw.slice('base64-'.length), 'base64url').toString('utf8')
    : raw;
  let token: unknown;
  try {
    token = (JSON.parse(json) as Record<string, unknown>).access_token;
  } catch {
    throw new Error('no session cookie');
  }
  if (typeof token !== 'string' || token === '') throw new Error('no session cookie');
  return token;
}

export async function sessionClaims(context: BrowserContext): Promise<SessionClaims> {
  return claimsOf(await sessionAccessToken(context)) as SessionClaims;
}

export async function sessionDbs(context: BrowserContext): Promise<{
  accessToken: string;
  serverDb: SupabaseClient;
  browserDb: SupabaseClient;
}> {
  const accessToken = await sessionAccessToken(context);
  return {
    accessToken,
    serverDb: sessionClient(accessToken, gateSecret()),
    browserDb: sessionClient(accessToken),
  };
}

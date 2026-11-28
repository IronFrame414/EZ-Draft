// EZD-007d Step 6 (vault/plans/EZD-007d.md; parent P-Step 4; D3; Q-0048 (a); Q-0173): the request gate.
// Pages are deny-by-default: no session on a non-public path is a 307 to /sign-in.
// EZD-1977 (audit 2026-11-24 F2 / U4): the 307 carries the asked-for path as ?next= (same-origin path only,
// server/auth/return-path.ts); Projects ("/") stays a bare /sign-in.
// Missing env or an Auth error counts as no session; the gate never answers 500. A token refresh rewrites
// the 400-day auth cookies here, so the 400 days count from the last use.
// EZD-342 (vault/plans/EZD-342.md; Q-0600): the https test and the session-cookie names come from cookie-names.ts.
// On https an unmarked request's plain session cookies are deleted (host-only, Max-Age=0, Secure, Path=/).
// EZD-346 (vault/plans/EZD-346.md; Q-0599): a write to /api that is not same-origin is refused.
// EZD-1931 (audit 2026-11-23 S7): before anything else, /dev and /api/dev answer 404 on Vercel production and
// preview (app/src/server/dev-gate.ts). The matcher names /dev (and the
// percent-escaped spellings of /dev and /api) so a dotted path under it still reaches the gate.
// EZD-1711 (AC-EZD-1711-1, -3; Q-0795): with billing on, a signed-in request also reads its company's billing mode
// (public.billing_gate, one indexed read) and server/billing/gate-rules.ts decides: in the 14 days after a company
// stops paying a write to /api is refused 403 billing_read_only; after them every page but Projects is sent to /
// (where the office layout shows the paywall) and /api is refused 403 billing_inactive, except the billing routes.
// A failed read passes the request (billing never locks a company out by mistake). Billing off: no read.
import { NextResponse, type NextRequest } from 'next/server';
import { HOST_COOKIE_PREFIX, isForwardedHttps, isSessionCookieName } from './lib/auth/cookie-names';
import { signedOutCookieName } from './lib/auth/device-sign-out';
import { refuseDevPath } from './server/dev-gate';
import { billingEnabled } from './server/billing/config';
import { billingDecision, billingSkips, type BillingDecision } from './server/billing/gate-rules';
import { parseBillingGate } from './server/billing/state-parse';
import { isPublicPath } from './server/auth/public-paths';
import { signInUrl } from './server/auth/return-path';
import { refuseCrossOriginWrite } from './server/auth/same-origin';
import { createSessionClient, type SessionCookieJar } from './server/auth/supabase-server';

export const config = {
  matcher: [
    // EZD-2022 (audit 2026-11-27 X5): only real static file endings skip the gate, so a page path with a dot in it
    // (/projects/a.b) is still gated.
    '/((?!_next/static|_next/image|.*\\.(?:png|jpe?g|gif|webp|avif|svg|ico|js|mjs|css|map|woff2?|txt|webmanifest|json)$).*)',
    '/api/:path*',
    '/dev/:path*',
    // EZD-1931: the same two with any letter percent-escaped (/%64ev/a.b), which the router decodes.
    '/((?:d|%64)(?:e|%65)(?:v|%76)(?:/.*)?)',
    '/((?:a|%61)(?:p|%70)(?:i|%69)(?:/.*)?)',
  ],
};

const BILLING_MESSAGE_KEY = {
  billing_read_only: 'error.billing_read_only',
  billing_inactive: 'error.billing_inactive',
} as const;

async function readBillingDecision(
  client: ReturnType<typeof createSessionClient>,
  request: NextRequest,
): Promise<BillingDecision> {
  try {
    const { data, error } = await client.rpc('billing_gate');
    if (error) return { kind: 'pass' };
    return billingDecision(parseBillingGate(data).mode, request.method, request.nextUrl.pathname);
  } catch {
    return { kind: 'pass' };
  }
}

type Written = { name: string; value: string; options: Parameters<SessionCookieJar['set']>[2] };

// EZD-120d Decided "Signed-out marker" (Q-0581; Q-0599): a request with the marker is signed out. Only the
// marker name for this scheme counts (prefixed on https, plain on http); the other name is ignored. Every session
// cookie (plain and prefixed) and the marker are deleted from the request and the browser, and the auth server
// is not asked.
function signedOutMarked(request: NextRequest): NextResponse | null {
  const https = isForwardedHttps(request.headers);
  const marker = signedOutCookieName(https);
  if (!request.cookies.has(marker)) return null;
  const names = request.cookies
    .getAll()
    .map((c) => c.name)
    .filter(isSessionCookieName);
  names.push(marker);
  for (const name of names) request.cookies.delete(name);
  const result = isPublicPath(request.nextUrl.pathname)
    ? NextResponse.next({ request })
    : NextResponse.redirect(
        signInUrl(request.nextUrl.origin, request.nextUrl.pathname, request.nextUrl.search),
        307,
      );
  const deleted = https ? { path: '/', maxAge: 0, secure: true } : { path: '/', maxAge: 0 };
  for (const name of names) result.cookies.set(name, '', deleted);
  result.headers.set('Cache-Control', 'private, no-store');
  return result;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const devRefused = refuseDevPath(request.nextUrl.pathname);
  if (devRefused !== null) return devRefused;
  const refused = refuseCrossOriginWrite(request);
  if (refused !== null) return refused;
  const marked = signedOutMarked(request);
  if (marked !== null) return marked;
  const stale = isForwardedHttps(request.headers)
    ? request.cookies
        .getAll()
        .map((c) => c.name)
        .filter((n) => isSessionCookieName(n) && !n.startsWith(HOST_COOKIE_PREFIX))
    : [];
  const response = NextResponse.next({ request });
  const written: Written[] = [];

  const jar: SessionCookieJar = {
    getAll: () => request.cookies.getAll().map(({ name, value }) => ({ name, value })),
    set: (name, value, options) => {
      written.push({ name, value, options });
      request.cookies.set(name, value);
      response.cookies.set(name, value, options);
    },
    isHttps: () => isForwardedHttps(request.headers),
  };

  let signedIn = false;
  let client: ReturnType<typeof createSessionClient> | null = null;
  try {
    client = createSessionClient(jar);
    const { data, error } = await client.auth.getClaims();
    signedIn = !error && typeof data?.claims?.sub === 'string' && data.claims.sub !== '';
  } catch {
    signedIn = false;
  }

  let result: NextResponse = response;
  if (!signedIn && !isPublicPath(request.nextUrl.pathname)) {
    result = NextResponse.redirect(
      signInUrl(request.nextUrl.origin, request.nextUrl.pathname, request.nextUrl.search),
      307,
    );
    for (const { name, value, options } of written) result.cookies.set(name, value, options);
  } else if (
    signedIn &&
    client !== null &&
    billingEnabled() &&
    !billingSkips(request.nextUrl.pathname)
  ) {
    const decision = await readBillingDecision(client, request);
    if (decision.kind === 'refuse') {
      result = NextResponse.json(
        { error: { code: decision.code, message_key: BILLING_MESSAGE_KEY[decision.code] } },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    } else if (decision.kind === 'redirect') {
      result = NextResponse.redirect(new URL(decision.to, request.nextUrl.origin), 307);
    }
    if (result !== response) {
      for (const { name, value, options } of written) result.cookies.set(name, value, options);
    }
  }
  for (const name of stale) result.cookies.set(name, '', { path: '/', maxAge: 0, secure: true });
  if (written.length > 0 || stale.length > 0)
    result.headers.set('Cache-Control', 'private, no-store');
  return result;
}

// EZD-007d Step 6 (vault/plans/EZD-007d.md; parent P-Step 4; D3; Q-0048 (a); Q-0173): the request gate.
// Pages are deny-by-default: no session on a non-public path is a 307 to /sign-in with no query string.
// Missing env or an Auth error counts as no session; the gate never answers 500. A token refresh rewrites
// the 400-day auth cookies here, so the 400 days count from the last use.
// EZD-342 (vault/plans/EZD-342.md; Q-0600): the https test and the session-cookie names come from cookie-names.ts.
// On https an unmarked request's plain session cookies are deleted (host-only, Max-Age=0, Secure, Path=/).
import { NextResponse, type NextRequest } from 'next/server';
import { HOST_COOKIE_PREFIX, isForwardedHttps, isSessionCookieName } from './lib/auth/cookie-names';
import { signedOutCookieName } from './lib/auth/device-sign-out';
import { isPublicPath } from './server/auth/public-paths';
import { createSessionClient, type SessionCookieJar } from './server/auth/supabase-server';

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\..*).*)'],
};

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
    : NextResponse.redirect(new URL('/sign-in', request.nextUrl.origin), 307);
  const deleted = https ? { path: '/', maxAge: 0, secure: true } : { path: '/', maxAge: 0 };
  for (const name of names) result.cookies.set(name, '', deleted);
  result.headers.set('Cache-Control', 'private, no-store');
  return result;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
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
  try {
    const { data, error } = await createSessionClient(jar).auth.getClaims();
    signedIn = !error && typeof data?.claims?.sub === 'string' && data.claims.sub !== '';
  } catch {
    signedIn = false;
  }

  let result: NextResponse = response;
  if (!signedIn && !isPublicPath(request.nextUrl.pathname)) {
    result = NextResponse.redirect(new URL('/sign-in', request.nextUrl.origin), 307);
    for (const { name, value, options } of written) result.cookies.set(name, value, options);
  }
  for (const name of stale) result.cookies.set(name, '', { path: '/', maxAge: 0, secure: true });
  if (written.length > 0 || stale.length > 0)
    result.headers.set('Cache-Control', 'private, no-store');
  return result;
}

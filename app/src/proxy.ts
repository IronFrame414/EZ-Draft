// EZD-007d Step 6 (vault/plans/EZD-007d.md; parent P-Step 4; D3; Q-0048 (a); Q-0173): the request gate.
// Pages are deny-by-default: no session on a non-public path is a 307 to /sign-in with no query string.
// Missing env or an Auth error counts as no session; the gate never answers 500. A token refresh rewrites
// the 400-day auth cookies here, so the 400 days count from the last use.
import { NextResponse, type NextRequest } from 'next/server';
import { isPublicPath } from './server/auth/public-paths';
import { createSessionClient, type SessionCookieJar } from './server/auth/supabase-server';

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\..*).*)'],
};

type Written = { name: string; value: string; options: Parameters<SessionCookieJar['set']>[2] };

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.next({ request });
  const written: Written[] = [];

  const jar: SessionCookieJar = {
    getAll: () => request.cookies.getAll().map(({ name, value }) => ({ name, value })),
    set: (name, value, options) => {
      written.push({ name, value, options });
      request.cookies.set(name, value);
      response.cookies.set(name, value, options);
    },
    isHttps: () =>
      (request.headers.get('x-forwarded-proto') ?? '').split(',')[0].trim() === 'https',
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
  if (written.length > 0) result.headers.set('Cache-Control', 'private, no-store');
  return result;
}

// EZD-346 (vault/plans/EZD-346.md; Q-0599): every state-changing /api request is same-origin.
// A write (any method but GET or HEAD) to an /api path is refused with 403 unless Sec-Fetch-Site is
// same-origin or, when that header is absent, Origin equals the request's own origin. It fails closed.
// Exceptions only by exact path, each with a reason.
import { NextResponse, type NextRequest } from 'next/server';

export const SAME_ORIGIN_EXCEPTIONS: readonly { path: string; reason: string }[] = [
  {
    path: '/api/monitoring',
    reason:
      'Error-report tunnel (EZD-024 Step 7): public, reads no session; scripts/errors/live-check.mjs posts to it from outside a browser.',
  },
];

export const CROSS_ORIGIN_REFUSED = {
  error: { code: 'cross_origin_refused', message_key: 'error.not_authorized' },
} as const;

export function isSafeMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD';
}

export function isApiPath(pathname: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return true;
  }
  const folded = decoded.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();
  return folded === '/api' || folded.startsWith('/api/');
}

export function isSameOriginRequest(
  headers: { get(name: string): string | null },
  ownOrigin: string,
): boolean {
  const site = headers.get('sec-fetch-site');
  if (site !== null) return site === 'same-origin';
  return headers.get('origin') === ownOrigin;
}

export function refuseCrossOriginWrite(request: NextRequest): NextResponse | null {
  if (isSafeMethod(request.method)) return null;
  const pathname = request.nextUrl.pathname;
  if (!isApiPath(pathname)) return null;
  if (SAME_ORIGIN_EXCEPTIONS.some((e) => e.path === pathname)) return null;
  if (isSameOriginRequest(request.headers, request.nextUrl.origin)) return null;
  return NextResponse.json(CROSS_ORIGIN_REFUSED, {
    status: 403,
    headers: { 'Cache-Control': 'no-store' },
  });
}

// EZD-1931 (audit 2026-11-23 S7; AC-EZD-1931-1): one gate for the developer test pages. Every path under /dev
// and /api/dev answers 404 on a Vercel deployment (VERCEL_ENV 'production' or 'preview') before any page or
// route code runs; locally (VERCEL_ENV unset or 'development') they answer as before. The per-file
// VERCEL_ENV checks in the pages stay as a second layer.

import { NextResponse } from 'next/server';

const DEV_PREFIXES = ['/dev', '/api/dev'] as const;

const hasDevPrefix = (pathname: string): boolean =>
  DEV_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * True for /dev, /dev/..., /api/dev and /api/dev/... (whole segments only; /devices is not a dev path).
 * The request path keeps its percent-escapes and Next's router matches the decoded path, so /%64ev/shell is
 * a dev path too: the raw and the decoded form are both tested. A path that does not decode is tested raw.
 */
export function isDevPath(pathname: string): boolean {
  if (hasDevPrefix(pathname)) return true;
  if (!pathname.includes('%')) return false;
  try {
    return hasDevPrefix(decodeURIComponent(pathname));
  } catch {
    return false;
  }
}

/** True when the deployment hides the dev pages: Vercel production and preview. */
export function devPagesHidden(env: Record<string, string | undefined> = process.env): boolean {
  const vercelEnv = env.VERCEL_ENV;
  return vercelEnv === 'production' || vercelEnv === 'preview';
}

/** A 404 for a dev path on a deployment that hides dev pages, else null. */
export function refuseDevPath(
  pathname: string,
  env: Record<string, string | undefined> = process.env,
): NextResponse | null {
  if (!isDevPath(pathname) || !devPagesHidden(env)) return null;
  return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

// EZD-007d Step 5 (vault/plans/EZD-007d.md; parent P-Step 4): the only pages the request gate lets
// through without a session. /api routes answer 401 themselves (requireApiSession, EZD-007c); /dev pages
// 404 in production. A later public page adds its entry in its own commit.
export const PUBLIC_PATHS: readonly string[] = [
  '/sign-in',
  '/auth/confirm',
  '/api',
  '/dev',
  '/terms',
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((entry) => pathname === entry || pathname.startsWith(`${entry}/`));
}

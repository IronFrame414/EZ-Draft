// EZD-1202 (vault/build/assumptions/EZD-1202.md Settled "Where the page and its data come from"; 11 Security): the
// headers of every client link answer, the page (app/src/proxy.ts) and GET /api/c/[token]. The link is a secret:
// never cached, never sent on as a referrer, never indexed. Pure, no imports (the proxy reads it).
export const CLIENT_PAGE_HEADERS: Readonly<Record<string, string>> = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
};

/** The client page: /c/<token> (and /c itself). */
export function isClientLinkPath(pathname: string): boolean {
  return pathname === '/c' || pathname.startsWith('/c/');
}

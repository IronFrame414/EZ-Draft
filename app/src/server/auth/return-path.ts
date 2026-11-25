// EZD-1977 (audit/ui-live-2026-11-24 F2 / U4; AC-EZD-1977-1): the page a signed-out person asked for, carried
// through sign-in as ?next=<path> and the sign-in next cookie. Only a same-origin path is kept: the value must
// start with one "/", with no backslash, whitespace or control character anywhere (a browser reads "/\x" and
// "/<tab>/x" as "//x"), and its percent-decoded form must not start with "//" either. The same holds for the
// value after the URL parser has removed dot segments ("/.//x" would become "//x"). Anything else is null and
// the person lands on Projects. The sign-in and link pages are null too, so sign-in never returns to itself.
// No imports: the request gate loads this file.
const BASE = 'http://return-path.invalid';
const MAX_LENGTH = 2048;
const SIGN_IN_PAGES = ['/sign-in', '/auth/confirm'];

// A backslash, any whitespace, or a control character (below U+0020, or U+007F).
function unsafeText(value: string): boolean {
  if (/[\\\s]/.test(value)) return true;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function returnPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_LENGTH) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || unsafeText(raw)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (decoded.startsWith('//') || unsafeText(decoded)) return null;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;
  const path = url.pathname;
  if (SIGN_IN_PAGES.some((p) => path === p || path.startsWith(`${p}/`))) return null;
  if (path === '/' && url.search === '') return null;
  // The parser removes dot segments ("/.//x" becomes "//x"), so the value returned is checked again.
  const result = path + url.search;
  if (result.startsWith('//') || unsafeText(result)) return null;
  try {
    if (decodeURIComponent(result).startsWith('//')) return null;
  } catch {
    return null;
  }
  return result;
}

// The request gate's sign-in address for an asked-for page: bare /sign-in for Projects ("/"), else with
// ?next= (Next's internal _rsc parameter dropped).
export function signInUrl(origin: string, pathname: string, search: string): URL {
  const url = new URL('/sign-in', origin);
  const params = new URLSearchParams(search);
  params.delete('_rsc');
  const query = params.toString();
  const next = returnPath(query === '' ? pathname : `${pathname}?${query}`);
  if (next !== null) url.searchParams.set('next', next);
  return url;
}

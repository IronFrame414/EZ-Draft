// EZD-711 (07 Integrations "Property appraiser sites (PBC, Broward)"; vault/build/assumptions.md EZD-711 "Which
// appraiser sites the server reads"): the only hosts the server fetches a pasted link from. Palm Beach County:
// pbcpao.gov (board S01bWizard "pbcpao.gov/Property/Details?parcelId=[PCN]"). Broward County: bcpa.net and its
// web.bcpa.net search pages (https://bcpa.net/, https://web.bcpa.net/InfoBroward/InfoBroward.asp). https only, the
// default port, no user name or password in the link.
export const APPRAISER_HOSTS = ['pbcpao.gov', 'www.pbcpao.gov', 'bcpa.net', 'www.bcpa.net', 'web.bcpa.net'] as const;

export const APPRAISER_URL_MAX = 2048;

// The link as a URL when the server may fetch it, else null.
export function appraiserUrl(raw: string): URL | null {
  const value = raw.trim();
  if (value === '' || value.length > APPRAISER_URL_MAX) return null;
  // A pasted link without a scheme (the board shows "pbcpao.gov/Property/...") is read as https.
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username !== '' || url.password !== '') return null;
  if (url.port !== '' && url.port !== '443') return null;
  if (!(APPRAISER_HOSTS as readonly string[]).includes(url.hostname.toLowerCase())) return null;
  url.hash = '';
  return url;
}

export function isAppraiserUrl(raw: string): boolean {
  return appraiserUrl(raw) !== null;
}

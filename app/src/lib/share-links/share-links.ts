// EZD-1201 (Q-0213 Share panel; S18 States "Contractor renews for 30 days"; 11 Security "revocable"): the browser
// side of the Share panel. A thrown fetch or an unreadable body is status 0 `network`.
export type ShareLinkStatus = 'active' | 'expired' | 'revoked';

export type ShareLink = {
  id: string;
  versionNo: number | null;
  recipient: { name: string; email: string };
  emailSentAt: string | null;
  createdAt: string;
  expiresAt: string;
  renewedAt: string | null;
  revokedAt: string | null;
  status: ShareLinkStatus;
};

export type ShareLinksResult = { ok: true; links: ShareLink[] } | { ok: false; status: number; code: string };
export type ShareLinkWrite = { ok: true } | { ok: false; status: number; code: string };

type Opts = { fetchImpl?: typeof fetch };

const codeOf = (body: unknown): string => {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === 'string' ? code : 'network';
};

async function call(url: string, init: RequestInit, opts?: Opts): Promise<{ status: number; body: unknown }> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(url, { credentials: 'same-origin', ...init });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      return { status: 0, body: null };
    }
    return { status: res.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

export async function fetchShareLinks(projectId: string, opts?: Opts): Promise<ShareLinksResult> {
  const r = await call(`/api/share-links?projectId=${encodeURIComponent(projectId)}`, {}, opts);
  const links = (r.body as { links?: unknown } | null)?.links;
  if (r.status === 200 && Array.isArray(links)) return { ok: true, links: links as ShareLink[] };
  return { ok: false, status: r.status, code: r.status === 0 ? 'network' : codeOf(r.body) };
}

async function write(id: string, action: 'renew' | 'revoke', opts?: Opts): Promise<ShareLinkWrite> {
  const r = await call(`/api/share-links/${encodeURIComponent(id)}/${action}`, { method: 'POST' }, opts);
  if (r.status === 200) return { ok: true };
  return { ok: false, status: r.status, code: r.status === 0 ? 'network' : codeOf(r.body) };
}

export const renewShareLinkRequest = (id: string, opts?: Opts) => write(id, 'renew', opts);
export const revokeShareLinkRequest = (id: string, opts?: Opts) => write(id, 'revoke', opts);

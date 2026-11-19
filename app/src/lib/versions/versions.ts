// EZD-122 (S20 Data shown; Q-0700 03 "model_version gains cause", 05 "Versions labels and panel"): the Versions
// panel's answers, shared by the server routes and the browser. No React. Rows never carry model_json or an email.
import type { ObjectValue } from '../outbox/model-api';

export const VERSION_CAUSES = [
  'stop_editing',
  'lock_release',
  'finish_import',
  'revert_from',
  'revert',
  'snapshot',
  'send',
] as const;

export type VersionCause = (typeof VERSION_CAUSES)[number];

export function versionCauseOf(v: unknown): VersionCause | null {
  return typeof v === 'string' && (VERSION_CAUSES as readonly string[]).includes(v)
    ? (v as VersionCause)
    : null;
}

export type VersionRow = {
  id: string;
  label: string | null;
  cause: VersionCause | null;
  isSnapshot: boolean;
  isSent: boolean;
  versionNo: number | null;
  sentTo: string | null;
  sentAt: string | null;
  createdAt: string;
  // The author's name; null when they have none or are gone (never an email).
  author: string | null;
  parentId: string | null;
};

export type VersionObject = ObjectValue & { id: string };

export type VersionDocument = { id: string; objects: VersionObject[] };

export const VERSIONS_LIST_MAX = 1000;

// The browser's calls. None throws: a failure answers the body's error code, `http_<status>` or `network_failed`.
export type Called<T> = { ok: true; body: T } | { ok: false; code: string };

async function call<T>(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit | undefined,
  pick: (body: unknown) => T | null,
): Promise<Called<T>> {
  let res: Response;
  try {
    res = await fetchImpl(url, init);
  } catch {
    return { ok: false, code: 'network_failed' };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
    return { ok: false, code: typeof code === 'string' ? code : `http_${res.status}` };
  }
  const value = pick(body);
  return value === null ? { ok: false, code: 'bad_response' } : { ok: true, body: value };
}

const base = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/versions`;
const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export function fetchVersions(projectId: string, fetchImpl: typeof fetch = fetch) {
  return call(fetchImpl, base(projectId), undefined, (b) => {
    const v = (b as { versions?: unknown } | null)?.versions;
    return Array.isArray(v) ? (v as VersionRow[]) : null;
  });
}

export function fetchVersion(
  projectId: string,
  versionId: string,
  fetchImpl: typeof fetch = fetch,
) {
  return call(fetchImpl, `${base(projectId)}/${encodeURIComponent(versionId)}`, undefined, (b) => {
    const v = (b as { version?: VersionDocument } | null)?.version;
    return v && Array.isArray(v.objects) ? v : null;
  });
}

export function postSnapshot(
  projectId: string,
  versionId: string,
  name: string,
  fetchImpl: typeof fetch = fetch,
) {
  return call(
    fetchImpl,
    `${base(projectId)}/${encodeURIComponent(versionId)}/snapshot`,
    post({ name }),
    (b) => {
      const v = (b as { version?: { id?: unknown; label?: unknown } } | null)?.version;
      return typeof v?.id === 'string' && typeof v.label === 'string'
        ? { id: v.id, label: v.label }
        : null;
    },
  );
}

export function postRevert(
  projectId: string,
  versionId: string,
  body: { lockEpoch: number; label: string },
  fetchImpl: typeof fetch = fetch,
) {
  return call(
    fetchImpl,
    `${base(projectId)}/${encodeURIComponent(versionId)}/revert`,
    post(body),
    (b) => {
      const v = (b as { version?: { id?: unknown } } | null)?.version;
      return typeof v?.id === 'string' ? { id: v.id } : null;
    },
  );
}

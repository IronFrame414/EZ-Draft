// EZD-125 (S06 Edit lock; Q-0697 decisions 03, 04, 05): the typed browser client for the lock routes under
// /api/projects/[id]/lock. No call throws: a thrown fetch is `network_failed`, an expected status whose body
// does not parse is `bad_response`, any other status is the body's `error.code` or `http_<status>`. The lock
// state shape is shared with the server (app/src/server/lock/lock.ts). The editor's open uses the smaller
// lock-open.ts; this file loads with the lock controller and Stop editing. No zod: this file is in the editor's
// first download (11 Budgets), so the bodies are checked by the small readers below.

export type LockFailure = { ok: false; code: string };

export type ReleaseReason = 'stop_editing' | 'closed';

export type Deps = { fetchImpl?: typeof fetch };

export type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
export const isStr = (v: unknown): v is string => typeof v === 'string';
export const isEpoch = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

export function readPerson(v: unknown): { appUserId: string; name: string } | undefined {
  return isObj(v) && isStr(v.appUserId) && isStr(v.name)
    ? { appUserId: v.appUserId, name: v.name }
    : undefined;
}

export const lockOf = (body: unknown): Obj | undefined =>
  isObj(body) && isObj(body.lock) ? body.lock : undefined;
export const BAD: LockFailure = { ok: false, code: 'bad_response' };

export const base = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/lock`;

export type Sent = { ok: true; status: number; body: unknown } | LockFailure;

export async function send(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  expected: number[],
): Promise<Sent> {
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
  if (!expected.includes(res.status)) {
    const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
    return { ok: false, code: typeof code === 'string' ? code : `http_${res.status}` };
  }
  return { ok: true, status: res.status, body };
}

export const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: body === undefined ? undefined : { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export type AcquireOutcome =
  | { ok: true; status: 'acquired'; lockEpoch: number; since: string }
  | { ok: true; status: 'held'; holder: { appUserId: string; name: string }; since: string }
  | LockFailure;

export async function acquireLock(
  projectId: string,
  deviceId: string,
  deps: Deps = {},
): Promise<AcquireOutcome> {
  const r = await send(
    deps.fetchImpl ?? fetch,
    base(projectId),
    json('POST', { deviceId }),
    [200, 409],
  );
  if (!r.ok) return r;
  if (r.status === 200) {
    const lock = lockOf(r.body);
    if (!lock || !isEpoch(lock.lockEpoch) || !isStr(lock.since)) return BAD;
    return { ok: true, status: 'acquired', lockEpoch: lock.lockEpoch, since: lock.since };
  }
  const held = isObj(r.body) ? r.body : {};
  const holder = readPerson(held.holder);
  if (isObj(held.error) && held.error.code === 'lock_held' && holder && isStr(held.since)) {
    return { ok: true, status: 'held', holder, since: held.since };
  }
  const code = (r.body as { error?: { code?: unknown } } | null)?.error?.code;
  return { ok: false, code: typeof code === 'string' ? code : 'http_409' };
}

export type PendingRequest = {
  id: string;
  requesterAppUserId: string;
  requesterName: string;
  requestedAt: string;
  deadlineAt: string;
};

export type LockState = {
  lockEpoch: number;
  holder: { appUserId: string; name: string } | null;
  since: string | null;
  offline: boolean;
  // The caller's own pending request.
  myRequest: { id: string; requestedAt: string; deadlineAt: string } | null;
  // The pending requests to the caller, when the caller holds the lock.
  requests: PendingRequest[];
  // The database clock when read, for the countdown.
  now: string;
};

function readRequestTimes(
  v: unknown,
): { id: string; requestedAt: string; deadlineAt: string } | undefined {
  return isObj(v) && isStr(v.id) && isStr(v.requestedAt) && isStr(v.deadlineAt)
    ? { id: v.id, requestedAt: v.requestedAt, deadlineAt: v.deadlineAt }
    : undefined;
}

function readLockState(v: unknown): LockState | undefined {
  if (!isObj(v) || !isEpoch(v.lockEpoch) || typeof v.offline !== 'boolean' || !isStr(v.now)) {
    return undefined;
  }
  const holder = v.holder === null ? null : readPerson(v.holder);
  const myRequest = v.myRequest === null ? null : readRequestTimes(v.myRequest);
  if (holder === undefined || myRequest === undefined) return undefined;
  if (v.since !== null && !isStr(v.since)) return undefined;
  if (!Array.isArray(v.requests)) return undefined;
  const requests: PendingRequest[] = [];
  for (const q of v.requests) {
    const times = readRequestTimes(q);
    if (!times || !isObj(q) || !isStr(q.requesterAppUserId) || !isStr(q.requesterName)) {
      return undefined;
    }
    requests.push({
      ...times,
      requesterAppUserId: q.requesterAppUserId,
      requesterName: q.requesterName,
    });
  }
  return {
    lockEpoch: v.lockEpoch,
    holder,
    since: v.since,
    offline: v.offline,
    myRequest,
    requests,
    now: v.now,
  };
}

export async function fetchLock(
  projectId: string,
  deps: Deps = {},
): Promise<{ ok: true; lock: LockState } | LockFailure> {
  const r = await send(deps.fetchImpl ?? fetch, base(projectId), { method: 'GET' }, [200]);
  if (!r.ok) return r;
  const lock = readLockState(isObj(r.body) ? r.body.lock : undefined);
  return lock ? { ok: true, lock } : BAD;
}

export type ReleaseOutcome = { ok: true; lockEpoch: number } | LockFailure;

export async function releaseLock(
  projectId: string,
  o: { reason: ReleaseReason; lockEpoch?: number },
  deps: Deps = {},
): Promise<ReleaseOutcome> {
  const body = o.lockEpoch === undefined ? { reason: o.reason } : o;
  const r = await send(
    deps.fetchImpl ?? fetch,
    `${base(projectId)}/release`,
    json('POST', body),
    [200],
  );
  if (!r.ok) return r;
  const lock = lockOf(r.body);
  return lock && isEpoch(lock.lockEpoch) ? { ok: true, lockEpoch: lock.lockEpoch } : BAD;
}

// The tab-close release (Q-0697 decisions 04): best effort, `keepalive`, carrying the epoch it held. Nothing is
// awaited; the page is going away.
export function sendClosingRelease(
  projectId: string,
  lockEpoch: number,
  fetchImpl: typeof fetch,
): void {
  fetchImpl(`${base(projectId)}/release`, {
    ...json('POST', { reason: 'closed', lockEpoch }),
    keepalive: true,
  }).catch(() => {});
}

export type RequestOutcome =
  | {
      ok: true;
      status: 'requested';
      request: { id: string; requestedAt: string; deadlineAt: string };
    }
  | { ok: true; status: 'lock_free' }
  | LockFailure;

export async function requestEdit(projectId: string, deps: Deps = {}): Promise<RequestOutcome> {
  const r = await send(
    deps.fetchImpl ?? fetch,
    `${base(projectId)}/request`,
    { method: 'POST' },
    [200, 201],
  );
  if (!r.ok) return r;
  if (r.status === 200) {
    return (r.body as { lockFree?: unknown } | null)?.lockFree === true
      ? { ok: true, status: 'lock_free' }
      : BAD;
  }
  const request = readRequestTimes(isObj(r.body) ? r.body.request : undefined);
  return request ? { ok: true, status: 'requested', request } : BAD;
}

export async function cancelRequest(
  projectId: string,
  deps: Deps = {},
): Promise<{ ok: true } | LockFailure> {
  const r = await send(
    deps.fetchImpl ?? fetch,
    `${base(projectId)}/request`,
    { method: 'DELETE' },
    [200],
  );
  return r.ok ? { ok: true } : r;
}

export type RespondOutcome =
  { ok: true; status: 'kept' | 'released'; lockEpoch: number } | LockFailure;

export async function respondRequest(
  projectId: string,
  requestId: string,
  response: 'release' | 'keep',
  deps: Deps = {},
): Promise<RespondOutcome> {
  const r = await send(
    deps.fetchImpl ?? fetch,
    `${base(projectId)}/respond`,
    json('POST', { requestId, response }),
    [200],
  );
  if (!r.ok) return r;
  const status = isObj(r.body) ? r.body.status : undefined;
  const lock = lockOf(r.body);
  return (status === 'kept' || status === 'released') && lock && isEpoch(lock.lockEpoch)
    ? { ok: true, status, lockEpoch: lock.lockEpoch }
    : BAD;
}

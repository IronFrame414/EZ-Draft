// EZD-134 (phase-01.md EZD-134 row; 03b Architecture rule 10; 11 Offline; architecture "Device storage"): the
// service worker's caching rules and its cache work. Plain JavaScript so Node runs the build (build-sw.mjs) without
// a compile step. The build copies every function below into public/sw.js as source text, so each one uses only its
// arguments, the constants and functions of this file, and worker globals (self, location, caches, fetch).
//
// Online the worker answers nothing: every request goes to the network as if there were no worker, so a page is
// never stale and the browser's request handling is unchanged. After each page load the page tells the worker what
// it loaded (warm-message.ts); the worker stores those answers (WARM_MESSAGE) and trims the project cache to the
// company's device cache budget. With the device offline the worker answers page loads and static files from the
// caches (the offline* routes).
// EZD-2002 (audit 2026-11-27 A1; AC-EZD-2002-1): the two field pages (the field pack and field measure) are the one
// exception online. Their load waits FIELD_WAIT_MS for the network; when it has not answered by then, answers with
// a server error (5xx) or fails, the stored copy answers (when there is one), and the network answer, once it
// lands, replaces the stored copy behind it (answerFieldPage).

import {
  BUILD_HEADER,
  BYTES_PER_MB,
  CACHE_PREFIX,
  DEVICE_CACHE_BUDGET_DEFAULT_MB,
  DEVICE_CACHE_BUDGET_KEY,
  DEVICE_CACHE_BUDGET_MIN_MB,
  FIELD_WAIT_MS,
  PROJECT_CACHE,
  SHELL_CACHE,
  STATIC_CACHE,
  STATIC_MAX_ENTRIES,
  WARM_MESSAGE,
} from './sw-constants.mjs';

export * from './sw-constants.mjs';

// A page of the app shell: outside the API, sign-in and auth links (they need the network), invites, dev pages
// and projects.
export function isShellPath(pathname) {
  return !/^\/(api|sign-in|auth|invite|dev|projects)(\/|$)/.test(pathname);
}

// A project page: /projects/<id> and the pages under it.
export function isProjectPath(pathname) {
  return /^\/projects\/[^/]+(\/|$)/.test(pathname);
}

// EZD-2002: a field page, the phone's field pack (/projects/<id>/field) or field measure (/projects/<id>/field-measure).
export function isFieldPagePath(pathname) {
  return /^\/projects\/[^/]+\/(field|field-measure)\/?$/.test(pathname);
}

// A built static file or an app icon.
export function isStaticPath(pathname) {
  return /^\/(_next\/static|app-icons|icons)\//.test(pathname);
}

// Only a whole, same-origin answer is stored: never an error, a redirect (a 307 to /sign-in must not be kept as
// the page) or an opaque answer.
export function isStorable(response) {
  return !!response && response.status === 200 && response.type === 'basic' && !response.redirected;
}

// The project a cached URL belongs to: a project page or, from EZD-1401, its API reads. Collection routes under
// /api/projects (counts, recent) are no project.
export function projectIdOf(href) {
  const m = /^\/(?:api\/)?projects\/([^/?#]+)/.exec(new URL(href, 'http://x').pathname);
  if (!m) return null;
  const id = decodeURIComponent(m[1]);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

// Which projects to drop: oldest first until the rest fit the budget, never the open project (even when it alone
// is over the budget). `projects` are { projectId, bytes, cachedAt }.
export function planEviction(projects, budgetBytes, openProjectId) {
  let total = projects.reduce((sum, p) => sum + p.bytes, 0);
  const drop = [];
  const oldestFirst = projects
    .filter((p) => p.projectId !== openProjectId)
    .sort((a, b) => a.cachedAt - b.cachedAt || (a.projectId < b.projectId ? -1 : 1));
  for (const p of oldestFirst) {
    if (total <= budgetBytes) break;
    drop.push(p.projectId);
    total -= p.bytes;
  }
  return drop;
}

// Worker routes: offline only, same origin only (Workbox routes match GET only).
export function offlineShellPage({ request, url }) {
  if (self.navigator.onLine || request.mode !== 'navigate' || url.origin !== location.origin) return false;
  return isShellPath(url.pathname);
}

export function offlineProjectPage({ request, url }) {
  if (self.navigator.onLine || request.mode !== 'navigate' || url.origin !== location.origin) return false;
  return isProjectPath(url.pathname);
}

// EZD-2002: a field page load while the phone says it is online (offline, offlineProjectPage answers it).
export function onlineFieldPage({ request, url }) {
  if (!self.navigator.onLine || request.mode !== 'navigate' || url.origin !== location.origin) return false;
  return isFieldPagePath(url.pathname);
}

// EZD-2002 (AC-EZD-2002-1): a field page load online. The network answer is used when it comes within FIELD_WAIT_MS
// and is not a server error; otherwise the stored copy answers. With no stored copy the load goes on waiting for
// the network and gets whatever it answers. A whole network answer (isStorable) always replaces the stored copy,
// also when it lands after the stored copy answered, so the next load starts from the newest page. Workbox copies
// this function into the worker as a route handler (build-sw.mjs).
export async function answerFieldPage({ event, request, url }) {
  const key = new URL(url.href);
  key.hash = '';
  const stored = () =>
    caches
      .open(PROJECT_CACHE)
      .then((c) => c.match(key.href, { ignoreVary: true }))
      .catch(() => undefined);
  // The copy is taken as the answer arrives, before the page reads its body.
  const network = fetch(request).then((response) => ({
    response,
    copy: isStorable(response) ? response.clone() : null,
  }));
  const refresh = network
    .then(({ copy }) => (copy ? caches.open(PROJECT_CACHE).then((c) => c.put(key.href, copy)) : undefined))
    .catch(() => undefined);
  if (event && typeof event.waitUntil === 'function') event.waitUntil(refresh);
  let timer;
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ late: true }), FIELD_WAIT_MS);
  });
  const first = await Promise.race([network.catch((error) => ({ error })), late]);
  clearTimeout(timer);
  if (first.response && first.response.status < 500) return first.response;
  const copy = await stored();
  if (copy) return copy;
  if (first.response) return first.response;
  if (first.late) return (await network).response;
  throw first.error;
}

export function offlineStaticFile({ url }) {
  if (self.navigator.onLine || url.origin !== location.origin) return false;
  return isStaticPath(url.pathname);
}

// Stores the page unless the cache holds it from the same build. Answers whether it stored it.
export async function warmPageCopy(href, build) {
  const url = new URL(href, location.origin);
  url.hash = '';
  if (url.origin !== location.origin) return false;
  const name = isShellPath(url.pathname)
    ? SHELL_CACHE
    : isProjectPath(url.pathname)
      ? PROJECT_CACHE
      : null;
  if (name === null) return false;
  const cache = await caches.open(name);
  const held = await cache.match(url.href, { ignoreVary: true });
  if (held && held.headers.get(BUILD_HEADER) === String(build)) return false;
  const response = await fetch(url.href, { credentials: 'same-origin', cache: 'no-store' });
  if (!isStorable(response)) return false;
  await cache.put(url.href, response);
  return true;
}

// Stores the same-origin static files that are not stored yet, then keeps the newest STATIC_MAX_ENTRIES. Answers
// how many it stored.
export async function warmFiles(hrefs) {
  const files = new Set();
  for (const href of hrefs) {
    if (typeof href !== 'string') continue;
    const url = new URL(href, location.origin);
    url.hash = '';
    if (url.origin === location.origin && isStaticPath(url.pathname)) files.add(url.href);
  }
  if (files.size === 0) return 0;
  const cache = await caches.open(STATIC_CACHE);
  let stored = 0;
  await Promise.all(
    [...files].map(async (u) => {
      try {
        if (await cache.match(u)) return;
        // Hashed names never change: the browser's own cache answers when it holds the file.
        const response = await fetch(u, { credentials: 'same-origin', cache: 'force-cache' });
        if (!isStorable(response)) return;
        await cache.put(u, response);
        stored += 1;
      } catch {
        // stored the next time it loads
      }
    }),
  );
  if (stored > 0) {
    const keys = await cache.keys();
    // Cache keys are in the order they were stored.
    for (const old of keys.slice(0, Math.max(0, keys.length - STATIC_MAX_ENTRIES))) await cache.delete(old);
  }
  return stored;
}

// The company's budget in megabytes (GET /api/settings/defaults, any member), or the default.
export async function readBudgetMb() {
  try {
    const res = await fetch('/api/settings/defaults', { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) return DEVICE_CACHE_BUDGET_DEFAULT_MB;
    const body = await res.json();
    const v = body && body.effective ? body.effective[DEVICE_CACHE_BUDGET_KEY] : undefined;
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : DEVICE_CACHE_BUDGET_DEFAULT_MB;
  } catch {
    return DEVICE_CACHE_BUDGET_DEFAULT_MB;
  }
}

// Trims the project cache to the budget (asked for only when the cache is over the smallest allowed budget, so a
// small cache makes no request). Only the project cache is read or changed; the outbox lives in IndexedDB and is
// never touched. Answers the dropped project ids.
export async function pruneProjects(openProjectId) {
  if (!(await caches.has(PROJECT_CACHE))) return [];
  const cache = await caches.open(PROJECT_CACHE);
  const byId = new Map();
  for (const request of await cache.keys()) {
    const id = projectIdOf(request.url);
    if (id === null) continue;
    const response = await cache.match(request, { ignoreVary: true });
    const bytes = response ? (await response.clone().blob()).size : 0;
    const date = Date.parse((response && response.headers.get('date')) || '');
    const p = byId.get(id) || { projectId: id, bytes: 0, cachedAt: 0, requests: [] };
    p.bytes += bytes;
    p.cachedAt = Math.max(p.cachedAt, Number.isNaN(date) ? 0 : date);
    p.requests.push(request);
    byId.set(id, p);
  }
  const projects = [...byId.values()];
  const total = projects.reduce((sum, p) => sum + p.bytes, 0);
  if (total <= DEVICE_CACHE_BUDGET_MIN_MB * BYTES_PER_MB) return [];
  const drop = planEviction(projects, (await readBudgetMb()) * BYTES_PER_MB, openProjectId);
  for (const id of drop) {
    for (const request of byId.get(id).requests) await cache.delete(request, { ignoreVary: true });
  }
  return drop;
}

// Paths the worker never answers. Where the browser has static routing (Chromium), install declares them as
// network routes, so their requests never wake the worker: a stopped worker is not started for them.
export const NETWORK_ONLY_PATHS = ['/api/*', '/sign-in', '/sign-in/*', '/auth/*', '/invite/*', '/dev/*'];

export function addNetworkRoutes(event) {
  if (typeof event.addRoutes !== 'function' || typeof URLPattern !== 'function') return;
  const routes = NETWORK_ONLY_PATHS.map((pathname) => ({
    condition: { urlPattern: new URLPattern({ pathname }) },
    source: 'network',
  }));
  event.waitUntil(Promise.resolve(event.addRoutes(routes)).catch(() => undefined));
}

// The page's message after a load: { type, build, page, files, openProject }. Never rejects.
export async function onWarmMessage(data) {
  if (!data || data.type !== WARM_MESSAGE) return;
  try {
    if (typeof data.page === 'string') await warmPageCopy(data.page, data.build);
  } catch {
    // the page is stored after its next load
  }
  try {
    if (Array.isArray(data.files)) await warmFiles(data.files);
  } catch {
    // stored after the next load
  }
  try {
    await pruneProjects(typeof data.openProject === 'string' ? data.openProject : null);
  } catch {
    // trimmed after the next load
  }
}

// EZD-1401 (S17 Offline status icon "spinner while caching"): when the warm work is done the worker answers the
// page that sent it with the same message type and `done`, so the page's offline icon checks the cache again
// without a timer. Never throws.
export function replyWarmed(source) {
  try {
    if (source && typeof source.postMessage === 'function') source.postMessage({ type: WARM_MESSAGE, done: true });
  } catch {
    // the page is gone
  }
}

// Constants and functions the build copies into the worker, in order (answerFieldPage goes in as a route handler,
// build-sw.mjs).
export const WORKER_CONSTANTS = {
  CACHE_PREFIX,
  SHELL_CACHE,
  STATIC_CACHE,
  PROJECT_CACHE,
  STATIC_MAX_ENTRIES,
  WARM_MESSAGE,
  BUILD_HEADER,
  DEVICE_CACHE_BUDGET_KEY,
  DEVICE_CACHE_BUDGET_DEFAULT_MB,
  DEVICE_CACHE_BUDGET_MIN_MB,
  BYTES_PER_MB,
  NETWORK_ONLY_PATHS,
  FIELD_WAIT_MS,
};
export const WORKER_FUNCTIONS = [
  isShellPath,
  isProjectPath,
  isStaticPath,
  isFieldPagePath,
  isStorable,
  projectIdOf,
  planEviction,
  warmPageCopy,
  warmFiles,
  readBudgetMb,
  pruneProjects,
  onWarmMessage,
  replyWarmed,
  addNetworkRoutes,
];

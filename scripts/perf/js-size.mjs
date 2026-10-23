// EZD-017 Step 6 (vault/plans/EZD-017.md S1-S5, G7): compressed JavaScript a page downloads with no user action
// (11 rule 7). One new browser context per measurement, so the HTTP cache starts empty (S4).
import path from 'node:path';
import { compressedSize } from './budgets.mjs';

const HOOKS_PATH = path.join(import.meta.dirname, 'page-hooks.browser.js');

const IDLE_MS = 1000;
const IDLE_CAP_MS = 15000;
const POLL_MS = 100;

/**
 * S4: after `goto` resolves at `load`, waits until no request has started for 1,000 ms (polled every 100 ms),
 * at most 15,000 ms from the call. Removes its listener either way.
 */
export function settlePage(page) {
  return new Promise((resolve) => {
    const started = Date.now();
    let last = started;
    const onRequest = () => {
      last = Date.now();
    };
    page.on('request', onRequest);
    const timer = setInterval(() => {
      const now = Date.now();
      let idleTimeout = null;
      if (now - last >= IDLE_MS) idleTimeout = false;
      else if (now - started >= IDLE_CAP_MS) idleTimeout = true;
      if (idleTimeout === null) return;
      clearInterval(timer);
      page.off('request', onRequest);
      resolve({ idleTimeout });
    }, POLL_MS);
  });
}

function contextOptions(profile) {
  return {
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    hasTouch: profile.hasTouch,
    isMobile: profile.isMobile,
  };
}

/** S1: a JavaScript file by resource type or content type. */
function isJavaScript(response) {
  if (response.request().resourceType() === 'script') return true;
  const type = (response.headers()['content-type'] ?? '').toLowerCase();
  return type.startsWith('text/javascript') || type.startsWith('application/javascript');
}

/** S3: pathname + search when same origin as the base URL, else the full URL. */
function displayUrl(url, baseOrigin) {
  const u = new URL(url);
  return u.origin === baseOrigin ? u.pathname + u.search : url;
}

/**
 * The scripts a page downloads with no user action (S1-S4), shared by the size and contents collectors (EZD-020
 * Step 5). `ctx` = { browser, profile, baseUrl }.
 * @returns {Promise<{ error?: string; details: object; scripts: { url: string; displayUrl: string; body: Buffer;
 *   serviceWorker: boolean }[] }>} details = { url, status, idleTimeout }
 */
export async function collectScripts(ctx, url) {
  const { browser, profile, baseUrl } = ctx;
  const baseOrigin = new URL(baseUrl).origin;
  const details = { url, status: null, idleTimeout: false };
  const scripts = [];
  const context = await browser.newContext(contextOptions(profile));
  try {
    await context.addInitScript({ path: HOOKS_PATH });
    const seen = new Set();
    const collected = [];
    // Listener attached before goto (S4); the body is read at once so it is not evicted.
    context.on('response', (response) => {
      const status = response.status();
      if (status < 200 || status > 299) return;
      const rUrl = response.url();
      if (seen.has(rUrl)) return;
      const fromWorker = response.request().serviceWorker() !== null;
      if (!fromWorker && !isJavaScript(response)) return;
      seen.add(rUrl);
      const body = response.body();
      // A body that cannot be read rejects when awaited below (E1), never as an unhandled rejection.
      body.catch(() => {});
      collected.push({ url: rUrl, fromWorker, body });
    });

    const page = await context.newPage();
    let response;
    try {
      response = await page.goto(baseUrl + url, { waitUntil: 'load' });
    } catch {
      return { error: 'navigation_failed', details, scripts };
    }
    if (!response) return { error: 'navigation_failed', details, scripts };
    details.status = response.status();
    if (details.status !== 200) return { error: `http_${details.status}`, details, scripts };

    const { idleTimeout } = await settlePage(page);
    details.idleTimeout = idleTimeout;
    const swUrls = new Set(await page.evaluate(() => window.__EZD_PERF__.swUrls));

    for (const c of collected) {
      const body = await c.body;
      scripts.push({
        url: c.url,
        displayUrl: displayUrl(c.url, baseOrigin),
        body,
        // S2 (a): service worker scripts and what they fetch are not page JavaScript.
        serviceWorker: c.fromWorker || swUrls.has(c.url),
      });
    }
    return { details, scripts };
  } finally {
    await context.close();
  }
}

/**
 * @returns {Promise<{ value: number; details: object } | { error: string; details: object }>} details = SizeDetails
 */
export async function measureJsSize(browser, profile, baseUrl, url) {
  const collected = await collectScripts({ browser, profile, baseUrl }, url);
  const details = {
    url,
    status: collected.details.status,
    files: [],
    excludedServiceWorkerBytes: 0,
    idleTimeout: collected.details.idleTimeout,
  };
  if (collected.error !== undefined) return { error: collected.error, details };
  let value = 0;
  for (const s of collected.scripts) {
    const compressedBytes = compressedSize(s.body);
    if (s.serviceWorker) {
      details.excludedServiceWorkerBytes += compressedBytes;
      continue;
    }
    value += compressedBytes;
    details.files.push({ url: s.displayUrl, rawBytes: s.body.length, compressedBytes });
  }
  return { value, details };
}

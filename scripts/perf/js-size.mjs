// EZD-017 Step 6 (vault/plans/EZD-017.md S1-S5, G7): compressed JavaScript a page downloads with no user action
// (11 rule 7). One new browser context per measurement, so the HTTP cache starts empty (S4).
// EZD-1996 (AC-EZD-1996-3): a page's download size counts its CSS too; measureCssSize is the CSS alone.
// EZD-1995 (AC-EZD-1995-3): a row whose config entry sets `document: true` counts the page's HTML too, where the
// page's screen messages travel.
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

// EZD-1998: `storageState` (a Playwright storage state file) opens the page signed in.
function contextOptions(profile, storageState) {
  return {
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    hasTouch: profile.hasTouch,
    isMobile: profile.isMobile,
    ...(storageState ? { storageState } : {}),
  };
}

/** S1: a JavaScript file by resource type or content type. */
function isJavaScript(response) {
  if (response.request().resourceType() === 'script') return true;
  const type = (response.headers()['content-type'] ?? '').toLowerCase();
  return type.startsWith('text/javascript') || type.startsWith('application/javascript');
}

/** EZD-1996: a CSS file by resource type or content type. */
function isStylesheet(response) {
  if (response.request().resourceType() === 'stylesheet') return true;
  return (response.headers()['content-type'] ?? '').toLowerCase().startsWith('text/css');
}

/** S3: pathname + search when same origin as the base URL, else the full URL. */
function displayUrl(url, baseOrigin) {
  const u = new URL(url);
  return u.origin === baseOrigin ? u.pathname + u.search : url;
}

/**
 * The scripts a page downloads with no user action (S1-S4), shared by the size and contents collectors (EZD-020
 * Step 5). `ctx` = { browser, profile, baseUrl, storageState? }. With `styles: true` the page's CSS files are collected too
 * (EZD-1996), each marked `kind: 'css'`; scripts are `kind: 'js'`.
 * @returns {Promise<{ error?: string; details: object; scripts: { url: string; displayUrl: string; body: Buffer;
 *   serviceWorker: boolean; kind: 'js' | 'css' }[] }>} details = { url, status, idleTimeout }
 */
export async function collectScripts(ctx, url, { styles = false, documents = false } = {}) {
  const { browser, profile, baseUrl, storageState } = ctx;
  const baseOrigin = new URL(baseUrl).origin;
  const details = { url, status: null, idleTimeout: false };
  const scripts = [];
  const context = await browser.newContext(contextOptions(profile, storageState));
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
      const css = styles && !fromWorker && isStylesheet(response);
      const html = documents && !fromWorker && response.request().resourceType() === 'document';
      if (!fromWorker && !css && !html && !isJavaScript(response)) return;
      seen.add(rUrl);
      const body = response.body();
      // A body that cannot be read rejects when awaited below (E1), never as an unhandled rejection.
      body.catch(() => {});
      collected.push({ url: rUrl, fromWorker, body, kind: html ? 'html' : css ? 'css' : 'js' });
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
    // EZD-1998: a page that sent the browser elsewhere (a signed-out field page goes to /sign-in) is not the page
    // asked for, so its size would be the wrong page's.
    const landed = new URL(page.url());
    const asked = new URL(baseUrl + url);
    if (landed.pathname !== asked.pathname) {
      details.landedUrl = landed.pathname + landed.search;
      return { error: 'redirected', details, scripts };
    }

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
        kind: c.kind,
      });
    }
    return { details, scripts };
  } finally {
    await context.close();
  }
}

/**
 * Compressed bytes of the page's files of the kinds in `kinds` (S1-S5; EZD-1996 adds CSS). details = SizeDetails
 * plus jsBytes and cssBytes; each file names its kind.
 */
async function measureSize(browser, profile, baseUrl, url, kinds, storageState) {
  const documents = kinds.includes('html');
  const collected = await collectScripts({ browser, profile, baseUrl, storageState }, url, { styles: true, documents });
  const details = {
    url,
    status: collected.details.status,
    files: [],
    jsBytes: 0,
    cssBytes: 0,
    excludedServiceWorkerBytes: 0,
    idleTimeout: collected.details.idleTimeout,
  };
  // EZD-1995: the page's HTML is listed in `documents`, not `files` (files are the page's static script and style
  // files, e2e/entries.spec.ts E4).
  if (documents) {
    details.documentBytes = 0;
    details.documents = [];
  }
  if (collected.details.landedUrl !== undefined) details.landedUrl = collected.details.landedUrl;
  if (collected.error !== undefined) return { error: collected.error, details };
  let value = 0;
  for (const s of collected.scripts) {
    const compressedBytes = compressedSize(s.body);
    if (s.serviceWorker) {
      details.excludedServiceWorkerBytes += compressedBytes;
      continue;
    }
    if (!kinds.includes(s.kind)) continue;
    value += compressedBytes;
    if (s.kind === 'css') details.cssBytes += compressedBytes;
    else if (s.kind === 'html') details.documentBytes += compressedBytes;
    else details.jsBytes += compressedBytes;
    const entry = { url: s.displayUrl, kind: s.kind, rawBytes: s.body.length, compressedBytes };
    if (s.kind === 'html') details.documents.push(entry);
    else details.files.push(entry);
  }
  return { value, details };
}

/**
 * The page's download size: its JavaScript and, since EZD-1996, its CSS.
 * @returns {Promise<{ value: number; details: object } | { error: string; details: object }>} details = SizeDetails
 */
export function measureJsSize(browser, profile, baseUrl, url, { storageState, document = false } = {}) {
  return measureSize(browser, profile, baseUrl, url, document ? ['js', 'css', 'html'] : ['js', 'css'], storageState);
}

/** EZD-1996 (AC-EZD-1996-3): the page's CSS alone. */
export function measureCssSize(browser, profile, baseUrl, url, { storageState } = {}) {
  return measureSize(browser, profile, baseUrl, url, ['css'], storageState);
}

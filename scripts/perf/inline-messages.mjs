// EZD-1995 (AC-EZD-1995-3; audit 2026-11-26 F1; Q-0814): the screen messages a page sends inside its HTML. A page's
// messages reach the browser as the `messages` prop of its MessagesProvider, which Next.js writes into the page's
// flight data (`self.__next_f.push([1, "..."])` scripts). The value is the download size (gzip level 6, Q-0071 (a))
// of every `"messages":{...}` object in that data. Node built-ins and Playwright (through the caller's browser) only.
import { compressedSize } from './budgets.mjs';

const PUSH = 'self.__next_f.push(';

/** The page's flight data: the text of every `self.__next_f.push([1, "<text>"])` call in its HTML, in order. */
export function flightText(html) {
  let out = '';
  let at = html.indexOf(PUSH);
  while (at !== -1) {
    const start = at + PUSH.length;
    const end = html.indexOf(')</script>', start);
    if (end === -1) break;
    try {
      const chunk = JSON.parse(html.slice(start, end));
      if (Array.isArray(chunk) && chunk[0] === 1 && typeof chunk[1] === 'string') out += chunk[1];
    } catch {
      // not a flight chunk this collector reads
    }
    at = html.indexOf(PUSH, end);
  }
  return out;
}

/** The end (exclusive) of the JSON object that starts at `start` (a `{`), reading strings with their escapes. */
function objectEnd(text, start) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

const MESSAGES_PROP = '"messages":{';

/** Every `"messages":{...}` object in the flight text, as its JSON text. */
export function messageObjects(flight) {
  const out = [];
  let at = flight.indexOf(MESSAGES_PROP);
  while (at !== -1) {
    const start = at + MESSAGES_PROP.length - 1;
    const end = objectEnd(flight, start);
    if (end === -1) break;
    out.push(flight.slice(start, end));
    at = flight.indexOf(MESSAGES_PROP, end);
  }
  return out;
}

/** Value and details of one page's HTML: { value: gzip bytes of its message objects, details }. */
export function inlineMessagesOf(html) {
  const objects = messageObjects(flightText(html));
  const text = objects.join('\n');
  let keys = 0;
  // EZD-2000: how many keys each object holds per two-segment prefix (`office.header`), so a page that sends another
  // screen's messages shows which.
  const prefixes = [];
  for (const o of objects) {
    const counts = {};
    try {
      const names = Object.keys(JSON.parse(o));
      keys += names.length;
      for (const k of names) {
        const p = k.split('.').slice(0, 2).join('.');
        counts[p] = (counts[p] ?? 0) + 1;
      }
    } catch {
      // a reference row, not an inline object
    }
    prefixes.push(counts);
  }
  return {
    value: objects.length === 0 ? 0 : compressedSize(text),
    details: {
      objects: objects.length,
      keys,
      rawBytes: Buffer.byteLength(text),
      documentBytes: compressedSize(html),
      prefixes,
    },
  };
}

/**
 * Opens the page (signed in with `storageState` when given) and measures its inline messages.
 * @returns {Promise<{ value: number; details: object } | { error: string; details: object }>}
 */
export async function measureInlineMessages(browser, profile, baseUrl, url, { storageState } = {}) {
  const details = { url, status: null };
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    hasTouch: profile.hasTouch,
    isMobile: profile.isMobile,
    ...(storageState ? { storageState } : {}),
  });
  try {
    const page = await context.newPage();
    let response;
    try {
      response = await page.goto(baseUrl + url, { waitUntil: 'load' });
    } catch {
      return { error: 'navigation_failed', details };
    }
    if (!response) return { error: 'navigation_failed', details };
    details.status = response.status();
    if (details.status !== 200) return { error: `http_${details.status}`, details };
    const landed = new URL(page.url());
    if (landed.pathname !== new URL(baseUrl + url).pathname) {
      details.landedUrl = landed.pathname + landed.search;
      return { error: 'redirected', details };
    }
    const measured = inlineMessagesOf(await response.text());
    return { value: measured.value, details: { ...details, ...measured.details } };
  } finally {
    await context.close();
  }
}

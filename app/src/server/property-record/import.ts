// EZD-711 (S01 Property appraiser link; 07 Integrations "Property appraiser sites (PBC, Broward)"; CLAUDE.md rule 5):
// the server read of a pasted appraiser link, used by the property_appraiser.read purpose. Only the hosts of
// appraiser-hosts.ts are fetched, every redirect is checked against them, and the read has a byte cap and a time
// limit. Any failure is `null`, so the caller offers "Paste page text" or "Paste screenshot" (S01).
//
// Tests never fetch a live site: with AI_MODE=stub (never allowed in production, server/ai/config.ts) the page is the
// recorded fixture (fixtures/pbc-page.ts); a unit test may set its own fetch with setAppraiserFetch.
import { appraiserUrl } from './appraiser-hosts';
import { PBC_FIXTURE_HTML } from './fixtures/pbc-page';

export const PAGE_MAX_BYTES = 2 * 1024 * 1024;
export const PAGE_TIMEOUT_MS = 10_000;
export const PAGE_REDIRECTS_MAX = 3;
// What the prompt gets of a page.
export const PAGE_TEXT_MAX_CHARS = 30_000;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const FETCH_KEY = '__ezdAppraiserFetch';

function override(): Fetch | undefined {
  return (globalThis as unknown as Record<string, Fetch | undefined>)[FETCH_KEY];
}

/** Test seam: the fetch the page read uses (null restores the default). */
export function setAppraiserFetch(fetchFn: Fetch | null): void {
  const g = globalThis as unknown as Record<string, Fetch | undefined>;
  if (fetchFn === null) delete g[FETCH_KEY];
  else g[FETCH_KEY] = fetchFn;
}

const stubFetch: Fetch = async () =>
  new Response(PBC_FIXTURE_HTML, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });

function pageFetch(env: Record<string, string | undefined>): Fetch {
  const o = override();
  if (o) return o;
  if (env.AI_MODE === 'stub' && env.VERCEL_ENV !== 'production') return stubFetch;
  return (url, init) => fetch(url, init);
}

async function readCapped(res: Response, max: number): Promise<string | null> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) return null;
  if (res.body === null) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(all);
}

/** The page's HTML, or null when the link is not an appraiser page or the read fails or is blocked. */
export async function fetchAppraiserPage(
  raw: string,
  opts: { signal?: AbortSignal; env?: Record<string, string | undefined> } = {},
): Promise<string | null> {
  let url = appraiserUrl(raw);
  if (url === null) return null;
  const doFetch = pageFetch(opts.env ?? process.env);
  const timeout = AbortSignal.timeout(PAGE_TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  try {
    for (let hop = 0; hop <= PAGE_REDIRECTS_MAX; hop++) {
      const res = await doFetch(url.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal,
        headers: { accept: 'text/html' },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (location === null) return null;
        const next = appraiserUrl(new URL(location, url).toString());
        if (next === null) return null;
        url = next;
        continue;
      }
      if (res.status !== 200) return null;
      const type = res.headers.get('content-type') ?? '';
      if (!/^\s*(text\/html|application\/xhtml\+xml|text\/plain)/i.test(type)) return null;
      return await readCapped(res, PAGE_MAX_BYTES);
    }
    return null;
  } catch {
    return null;
  }
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) {
      const n = Number.parseInt(name.slice(2), 16);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ' ';
    }
    if (name.startsWith('#')) {
      const n = Number.parseInt(name.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ' ';
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** The page's visible text: scripts, styles and tags removed, one line per block, capped for the prompt. */
export function pageText(html: string): string {
  const text = html
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(td|th)\s*>/gi, ' \t ')
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h[1-6]|\/section|\/table|\/header|\/footer)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ');
  return decodeEntities(text)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '')
    .join('\n')
    .slice(0, PAGE_TEXT_MAX_CHARS);
}

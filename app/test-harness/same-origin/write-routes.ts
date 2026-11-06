// EZD-346 Build step 1 (vault/plans/EZD-346.md, Decided D-Walk; AC-EZD-346-3): list every write route.ts under
// <appSrcDir>/app/ with a request URL, and report the ones the same-origin gate does not refuse when the request
// is cross-site. Routes outside /api are listed too, so a write route outside /api is reported as uncovered.
// Test-only.
import { NextRequest } from 'next/server';
import { listRouteMethods, type HttpMethod } from '../money/routes';

export const WRITE_ROUTE_PLACEHOLDER_ID = '00000000-0000-4000-8000-000000000000';

export type WriteRoute = { file: string; method: HttpMethod | '*'; url: string };

const ROUTE_TAIL = '/route.ts';
const APP_PREFIX = 'app/src/app/';

function urlOf(file: string): string {
  const inner = file.slice(APP_PREFIX.length, file.length - ROUTE_TAIL.length);
  const segments = inner
    .split('/')
    .filter((s) => s !== '' && !s.startsWith('(') && !s.startsWith('@'))
    .map((s) => (s.startsWith('[') ? WRITE_ROUTE_PLACEHOLDER_ID : s));
  return '/' + segments.join('/');
}

export function writeRoutes(appSrcDir: string): WriteRoute[] {
  return listRouteMethods(appSrcDir)
    .filter((r) => r.method !== 'GET' && r.method !== 'HEAD')
    .map((r) => ({ file: r.file, method: r.method, url: urlOf(r.file) }));
}

export async function uncoveredWriteRoutes(
  routes: readonly WriteRoute[],
  gate: (request: NextRequest) => Promise<Response>,
  matches: (url: string) => boolean,
  exceptionPaths: readonly string[],
): Promise<string[]> {
  const out: string[] = [];
  for (const route of routes) {
    if (exceptionPaths.includes(route.url)) continue;
    const full = 'http://localhost:3000' + route.url;
    let covered = false;
    if (matches(full)) {
      const request = new NextRequest(full, {
        method: route.method === '*' ? 'POST' : route.method,
        headers: { 'sec-fetch-site': 'cross-site', origin: 'https://attacker.example' },
      });
      const res = await gate(request);
      if (res.status === 403) {
        try {
          const body = (await res.json()) as { error?: { code?: unknown } };
          covered = body?.error?.code === 'cross_origin_refused';
        } catch {
          covered = false;
        }
      }
    }
    if (!covered) out.push(`${route.method} ${route.file}`);
  }
  return out;
}

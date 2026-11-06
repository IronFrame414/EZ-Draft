// EZD-346 Build step 3 (vault/plans/EZD-346.md, Decided D-E2E origin): the Origin header a Playwright API
// request must send to write to /api. Playwright API requests send neither Origin nor Sec-Fetch-Site, so this
// exercises the Origin fallback rule. Must run inside a test (it reads the project's baseURL).
// The origin is built the way Next parses it (NextRequest nextUrl), because Next rewrites loopback hosts
// (127.0.0.1, [::1]) to localhost and the proxy compares the Origin exactly.
import { test } from '@playwright/test';
import { NextRequest } from 'next/server';

export function appOriginHeaders(): { origin: string } {
  const base = test.info().project.use.baseURL;
  if (base === undefined) throw new Error('baseURL not set');
  return { origin: new NextRequest(base).nextUrl.origin };
}

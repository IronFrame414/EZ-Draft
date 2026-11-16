// EZD-125: under captureTraffic a routed subresource request carries the Sec-Fetch-Site Chromium sends, which it
// adds after interception (test-harness/e2e/traffic.ts header). Without it the EZD-346 guard refused the routed copy
// of the editor's lock POST at open (money-pages W1, W2). Expected values: the Fetch Metadata spec (same-origin for
// the page's own origin; same-site for the same host on another port). Untagged: desktop (Chromium) only.
import { createServer, type Server } from 'node:http';
import { captureTraffic, expect, test } from '../test-harness/e2e/test';

let port = 0;
let server: Server | null = null;
const seen: (string | undefined)[] = [];

test.describe('EZD-125 traffic capture Sec-Fetch-Site', () => {
  test.beforeAll(async () => {
    const s = createServer((req, res) => {
      seen.push(req.headers['sec-fetch-site'] as string | undefined);
      req.resume();
      res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' });
      res.end('ok');
    });
    await new Promise<void>((resolve) => s.listen(0, '127.0.0.1', () => resolve()));
    const address = s.address();
    port = typeof address === 'object' && address !== null ? address.port : 0;
    server = s;
  });

  test.afterAll(async () => {
    const s = server;
    if (s === null) return;
    s.closeAllConnections();
    await new Promise<void>((resolve) => s.close(() => resolve()));
    server = null;
  });

  test('EZD-125 TS1 a same-origin write passes the same-origin guard under capture', async ({
    page,
    context,
  }) => {
    const traffic = await captureTraffic(context);
    await page.goto('/sign-in');
    const answer = await page.evaluate(async () => {
      const res = await fetch('/api/projects/00000000-0000-4000-8000-000000000000/lock', {
        method: 'POST',
        body: '{}',
      });
      return { status: res.status, body: (await res.json()) as { error?: { code?: string } } };
    });
    await traffic.settle();
    // Signed out: the route's own 401, not the guard's 403 cross_origin_refused.
    expect(answer).toEqual({
      status: 401,
      body: expect.objectContaining({ error: expect.objectContaining({ code: 'not_signed_in' }) }),
    });
  });

  test('EZD-125 TS2 a write to the same host on another port is same-site', async ({
    page,
    context,
  }) => {
    const traffic = await captureTraffic(context);
    await page.goto('/sign-in');
    seen.length = 0;
    const status = await page.evaluate(
      async (url) => (await fetch(url, { method: 'POST', body: 'x' })).status,
      `http://127.0.0.1:${port}/ezd125-site`,
    );
    await traffic.settle();
    expect(status).toBe(200);
    expect(seen).toEqual(['same-site']);
  });
});

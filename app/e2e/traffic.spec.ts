// EZD-163 R1-R5 (vault/plans/EZD-163.md section 4; Q-0337 (b)): the traffic collector that EZD-016a T12 and
// EZD-007f T21, T23 use reads every response in Node before the page gets it, service worker traffic,
// navigation redirects and a POST answered after the page left included, and a read that never finishes fails
// settle() by name. Untagged: desktop (Chromium) only, which R1's CDP session needs. A local node:http server
// on 127.0.0.1 (allowed by the net guard) serves the hanging and the slow response (section 1, R2-R5 row).
import { createServer, type Server } from 'node:http';
import type { Page } from '@playwright/test';
import {
  captureTraffic,
  cleanup,
  closeHarness,
  createTenant,
  expect,
  test,
} from '../test-harness/e2e/test';
import { viewerMember } from '../test-harness/projects-search-fixture';

// Tests of one file run in order in one worker (no fullyParallel), and R2, R3 compare with their own before.
let port = 0;
let hangHits = 0;
let server: Server | null = null;

const hangUrl = () => `http://127.0.0.1:${port}/ezd163-hang`;
const slowUrl = () => `http://127.0.0.1:${port}/ezd163-slow`;

test.describe('EZD-163 traffic capture', () => {
  test.beforeAll(async () => {
    const s = createServer((req, res) => {
      const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
      if (req.method === 'GET' && path === '/ezd163-hang') {
        hangHits += 1;
        res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' });
        res.write('x');
        return; // never ends
      }
      if (req.method === 'POST' && path === '/ezd163-slow') {
        req.resume();
        setTimeout(() => {
          res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' });
          res.end('ezd163-slow-body');
        }, 700);
        return;
      }
      res.writeHead(404);
      res.end();
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

  // R1 (AC-EZD-163-1): C1; P1, P5, P6, P11; app/public/sw.js line 2.
  test('EZD-163 R1 service worker traffic is read and a stopped worker breaks nothing', async ({
    page,
    context,
  }) => {
    const traffic = await captureTraffic(context);
    await page.goto('/sign-in');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));

    let stopped = false;
    const cdp = await context.newCDPSession(page);
    await cdp.send('ServiceWorker.enable');
    cdp.on('ServiceWorker.workerVersionUpdated', (e) => {
      if (e.versions.some((v) => v.runningStatus === 'stopped' && v.scriptURL.endsWith('/sw.js'))) {
        stopped = true;
      }
    });
    await cdp.send('ServiceWorker.stopAllWorkers');
    await expect.poll(() => stopped).toBe(true);

    await page.goto('/sign-in');
    await page.getByTestId('sign-in-email').waitFor();
    const result = await traffic.settle();

    expect(stopped).toBe(true);
    expect(context.browser()?.isConnected()).toBe(true);
    expect(
      result.requests.filter(
        (r) => r.fromServiceWorker && r.method === 'GET' && r.path === '/sw.js',
      ).length >= 1,
    ).toBe(true);
    expect(
      result.responses.filter(
        (r) =>
          r.fromServiceWorker &&
          r.path === '/sw.js' &&
          r.status === 200 &&
          r.body.includes('skipWaiting'),
      ).length >= 1,
    ).toBe(true);
    expect(result.requests.filter((r) => r.external).length).toBe(0);
  });

  // R2 (AC-EZD-163-1): step 1 items 5d, 7; P9 timeout text.
  test('EZD-163 R2 a response that never ends fails settle by name', async ({ page, context }) => {
    const before = hangHits;
    const traffic = await captureTraffic(context, { fetchTimeoutMs: 500, settleTimeoutMs: 5000 });
    await page.goto('/sign-in');
    await page.evaluate((u) => {
      void fetch(u).catch(() => {});
    }, hangUrl());
    await expect.poll(() => hangHits).toBe(before + 1);
    await expect(traffic.settle()).rejects.toThrow(
      /^traffic read failed: GET \/ezd163-hang: route\.fetch: Timeout 500ms exceeded/,
    );
  });

  // R3 (AC-EZD-163-1): step 1 item 7; D-Bound.
  test('EZD-163 R3 settle names a read still pending at its limit', async ({ page, context }) => {
    const before = hangHits;
    const traffic = await captureTraffic(context, { fetchTimeoutMs: 10000, settleTimeoutMs: 500 });
    await page.goto('/sign-in');
    await page.evaluate((u) => {
      void fetch(u).catch(() => {});
    }, hangUrl());
    await expect.poll(() => hangHits).toBe(before + 1);
    await expect(traffic.settle()).rejects.toThrow(
      /^traffic reads pending after 500 ms: .*GET \/ezd163-hang/,
    );
  });

  // R4 (AC-EZD-163-1): request gate 307 (architecture ### Auth and session (EZD-007)); D-Redirect; P10.
  test('EZD-163 R4 a navigation redirect is followed through the route', async ({
    page,
    context,
  }) => {
    const traffic = await captureTraffic(context);
    await page.goto('/');
    const result = await traffic.settle();

    expect(new URL(page.url()).pathname).toBe('/sign-in');
    expect(
      result.responses.filter(
        (r) =>
          r.method === 'GET' && r.path === '/' && r.status === 307 && r.redirectedTo === '/sign-in',
      ).length >= 1,
    ).toBe(true);
    expect(
      result.responses.filter(
        (r) =>
          r.method === 'GET' &&
          r.path === '/sign-in' &&
          r.resourceType === 'document' &&
          r.status === 200 &&
          r.body.length > 0,
      ).length >= 1,
    ).toBe(true);
    expect(result.requests.filter((r) => r.external).length).toBe(0);
  });

  // R5 (AC-EZD-163-1): Q-0337 (b) (non-GET bodies included); C2; P11.
  test('EZD-163 R5 a POST answered after the page left is still read', async ({
    page,
    context,
  }) => {
    const traffic = await captureTraffic(context);
    await page.goto('/sign-in');
    await page.evaluate((u) => {
      void fetch(u, { method: 'POST', body: 'x' }).catch(() => {});
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- runs in the test page through page.evaluate, not in a Next.js component; R5 needs a plain browser navigation
      location.assign('/sign-in?r5=1');
    }, slowUrl());
    await page.waitForURL((u) => u.search === '?r5=1');
    const result = await traffic.settle();

    expect(
      result.responses.filter(
        (r) =>
          r.method === 'POST' &&
          r.path === '/ezd163-slow' &&
          r.status === 200 &&
          r.body === 'ezd163-slow-body',
      ).length >= 1,
    ).toBe(true);
  });
});

// Landing settle (EZD-117b E11): count finished GET /api/notifications; the mount fetch and the first-join resync make 2.
// Copy of app/e2e/projects.spec.ts countNotificationGets.
function countNotificationGets(page: Page): () => number {
  let count = 0;
  page.on('requestfinished', (req) => {
    if (req.method() === 'GET' && new URL(req.url()).pathname === '/api/notifications') count++;
  });
  return () => count;
}

test.describe('EZD-353 traffic capture keeps the Realtime socket', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  // EZD-353 T1 (AC-EZD-353-1): plan section 4. Expected: socketErrors empty; /api/realtime/token once; /api/notifications GET twice.
  // Sources: hub.ts header (token on first connect only); projects.spec.ts B1/B4 (EZD-117b E4, E10; Q-0450 (a)); EZD-110b D16; P1.
  test('EZD-353 T1 under captureTraffic the Realtime websocket connects and /api/realtime/token is fetched once', async ({
    page,
    context,
    signInAs,
  }) => {
    const m = await viewerMember(await createTenant());
    const landing = countNotificationGets(page);
    await signInAs(m.email);
    await expect.poll(landing).toBe(2);
    let frames = 0;
    const socketErrors: string[] = [];
    const gets = countNotificationGets(page);
    // The adapter opens its socket at /realtime/v1 (app/src/lib/realtime/adapter.ts line 50).
    page.on('websocket', (ws) => {
      if (!new URL(ws.url()).pathname.startsWith('/realtime/v1')) return;
      ws.on('framereceived', () => {
        frames += 1;
      });
      ws.on('socketerror', (error) => {
        socketErrors.push(error);
      });
    });
    const traffic = await captureTraffic(context);
    await page.goto('/');
    await expect(page.getByTestId('notification-bell')).toBeVisible();
    await expect.poll(() => frames).toBeGreaterThan(0);
    await expect.poll(gets).toBe(2);
    // Late refetch window, as projects.spec.ts B4.
    await page.waitForTimeout(500);
    const result = await traffic.settle();

    expect(socketErrors).toEqual([]);
    expect(result.requests.filter((r) => r.path === '/api/realtime/token')).toHaveLength(1);
    expect(
      result.requests.filter((r) => r.method === 'GET' && r.path === '/api/notifications'),
    ).toHaveLength(2);
  });
});

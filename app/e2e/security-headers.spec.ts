// EZD-1930 (audit 2026-11-23 S6; AC-EZD-1930-1, AC-EZD-1930-2). Untagged, so desktop.
// B1: an HTML page, an /api answer and an /api refusal made by the request gate each carry
// Content-Security-Policy frame-ancestors 'self', X-Content-Type-Options nosniff and a Permissions-Policy with
// camera, microphone and geolocation off. B2: a page on another origin cannot frame /projects/<id>; the app's own
// page can (Run benchmark frames the editor from the same origin, docs/architecture.md Benchmark runs, Framing).
// Expected values: the ticket's acceptance criteria.
import type { APIResponse, Frame, Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { seedFixtureS } from '../test-harness/projects-fixture';

// EZD-2022 (AC-EZD-2022-2): the policy gained object-src 'none' and base-uri 'self'. Chrome's console refusal quotes
// the frame-ancestors directive alone.
const FRAME_ANCESTORS = "frame-ancestors 'self'";
const CSP = `${FRAME_ANCESTORS}; object-src 'none'; base-uri 'self'`;
const PERMISSIONS = 'camera=(), microphone=(), geolocation=()';
const CHROME_ERROR_URL = 'chrome-error://chromewebdata/';

function expectSecurityHeaders(res: APIResponse | { headers(): Record<string, string> }) {
  const h = res.headers();
  expect(h['content-security-policy']).toBe(CSP);
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['permissions-policy']).toBe(PERMISSIONS);
}

function childFrame(page: Page): Frame | undefined {
  return page.frames().find((f) => f !== page.mainFrame());
}

test.describe('EZD-1930 security headers', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-1930 B1 pages and /api answers carry the security headers', async ({ page }) => {
    const signIn = await page.request.get('/sign-in');
    expect(signIn.status()).toBe(200);
    expect(signIn.headers()['content-type']).toContain('text/html');
    expectSecurityHeaders(signIn);

    const health = await page.request.get('/api/health');
    expectSecurityHeaders(health);

    // A cross-site write is refused by the request gate before any route runs (EZD-346).
    const refused = await page.request.patch('/api/profile', {
      headers: { 'sec-fetch-site': 'cross-site', origin: 'https://attacker.example' },
      data: {},
    });
    expect(refused.status()).toBe(403);
    expectSecurityHeaders(refused);
  });

  test('EZD-1930 B2 another origin cannot frame the editor; the own origin can', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, ['view_projects', 'edit_model'] as never);
    await signInAs(m.email);

    const base = test.info().project.use.baseURL!;
    const editorUrl = new URL(`/projects/${ids.P1}`, base).toString();

    // The editor page itself answers with the headers for this signed-in member.
    const direct = await page.request.get(editorUrl);
    expect(direct.status()).toBe(200);
    expectSecurityHeaders(direct);

    // Own origin: the frame loads the editor.
    await page.goto('/projects');
    await page.evaluate((src) => {
      const f = document.createElement('iframe');
      f.src = src;
      document.body.appendChild(f);
    }, `/projects/${ids.P1}`);
    await expect.poll(() => childFrame(page)?.url() ?? '').toBe(editorUrl);
    await expect(childFrame(page)!.locator('body')).not.toBeEmpty();

    // Another origin: the same server under localhost, a different origin from 127.0.0.1 (a page the test serves
    // itself is refused by Chrome's local network check before the request leaves, which would prove nothing).
    // The editor's answer reaches the browser with frame-ancestors 'self', and the browser refuses to show it.
    const otherUrl = new URL(base);
    otherUrl.hostname = 'localhost';
    await page.goto(new URL('/sign-in', otherUrl).toString());
    expect(new URL(page.url()).origin).not.toBe(new URL(base).origin);
    const refusals: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().includes('frame-ancestors')) refusals.push(msg.text());
    });
    const framed = page.waitForResponse((r) => r.url() === editorUrl);
    await page.evaluate((src) => {
      const f = document.createElement('iframe');
      f.src = src;
      document.body.appendChild(f);
    }, editorUrl);
    expectSecurityHeaders(await framed);
    await expect.poll(() => childFrame(page)?.url() ?? '').toBe(CHROME_ERROR_URL);
    await expect.poll(() => refusals.length).toBeGreaterThan(0);
    expect(refusals[0]).toContain(`"${FRAME_ANCESTORS}"`);
  });

  // EZD-2022 (AC-EZD-2022-2, AC-EZD-2022-3; audit 2026-11-27 X6, X7). Expected values: the acceptance criteria.
  test('EZD-2022 B3 protection headers, robots.txt and a quiet health check signed out', async ({
    page,
  }) => {
    const signIn = await page.request.get('/sign-in');
    expect(signIn.status()).toBe(200);
    const h = signIn.headers();
    expect(h['x-powered-by']).toBeUndefined();
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['strict-transport-security']).toBe('max-age=63072000; includeSubDomains');
    expect(h['x-ezdraft-app-build']).toBeUndefined();

    const robots = await page.request.get('/robots.txt');
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toBe('User-agent: *\nDisallow: /\n');
    expect(robots.headers()['x-ezdraft-app-build']).toBeUndefined();

    const health = await page.request.get('/api/health');
    expect(health.status()).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });
    expect(health.headers()['x-ezdraft-app-build']).toBeUndefined();
    expect(health.headers()['x-powered-by']).toBeUndefined();

    // A page path with a dot in it is turned away by the request gate itself: its 307 carries ?next= (EZD-1977),
    // the page's own requireSession redirect is a bare /sign-in.
    const dotted = await page.request.get('/projects/a.b', { maxRedirects: 0 });
    expect(dotted.status()).toBe(307);
    const to = new URL(dotted.headers()['location']!, 'http://x');
    expect(to.pathname).toBe('/sign-in');
    expect(to.searchParams.get('next')).toBe('/projects/a.b');
  });

  test('EZD-2022 B4 signed in, the build header and the schema version come back', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await signInAs(m.email);
    const health = await page.request.get('/api/health');
    expect(health.status()).toBe(200);
    const body = await health.json();
    expect(body.status).toBe('ok');
    expect(body.schema_version).toMatch(/^[0-9]{14}$/);
    expect(health.headers()['x-ezdraft-app-build']).toMatch(/^[0-9]+$/);
  });
});

// EZD-013 B1-B4 (vault/plans/EZD-013.md section 4).
import type { Page } from '@playwright/test';
import { expect, test } from '../test-harness/e2e/test';

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function ihdr(body: Buffer): { width: number; height: number } {
  expect([...body.subarray(0, 8)]).toEqual(PNG_SIG);
  return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
}

async function attr(page: Page, selector: string, name: string): Promise<string | null> {
  return page.locator(selector).first().getAttribute(name);
}

test.describe('EZD-013 PWA install', () => {
  test('EZD-013 done when: a valid manifest with display standalone and a registered service worker', async ({
    page,
  }) => {
    await page.goto('/sign-in');
    await expect(page.locator('link[rel=manifest]')).toHaveCount(1);
    const href = await attr(page, 'link[rel=manifest]', 'href');
    const manifestUrl = new URL(href ?? '', page.url());
    expect(manifestUrl.pathname).toBe('/manifest.webmanifest');
    const res = await page.request.get(manifestUrl.toString());
    expect(res.status()).toBe(200);
    const ct = res.headers()['content-type'] ?? '';
    expect(ct.startsWith('application/manifest+json') || ct.startsWith('application/json')).toBe(
      true,
    );
    const m = JSON.parse(await res.text());
    const origin = new URL(page.url()).origin;
    expect(m.display).toBe('standalone');
    expect(m.name).toBe('EZ Draft');
    const start = new URL(m.start_url, manifestUrl);
    expect(start.origin).toBe(origin);
    expect(start.pathname).toBe('/');
    expect(new URL(m.scope, manifestUrl).toString()).toBe(`${origin}/`);
    const icons = m.icons as { src: string; sizes: string; type: string; purpose: string }[];
    const want = [
      { sizes: '192x192', purpose: 'any' },
      { sizes: '512x512', purpose: 'any' },
      { sizes: '512x512', purpose: 'maskable' },
    ];
    for (const w of want) {
      const icon = icons.find(
        (i) => i.sizes === w.sizes && i.purpose === w.purpose && i.type === 'image/png',
      );
      expect(icon, `${w.sizes} ${w.purpose}`).toBeDefined();
      const r = await page.request.get(new URL(icon!.src, manifestUrl).toString());
      expect(r.status()).toBe(200);
      expect(r.headers()['content-type']).toBe('image/png');
      const { width, height } = ihdr(await r.body());
      expect(`${width}x${height}`).toBe(w.sizes);
    }

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('service worker not activated in 10 s')), 10_000),
    );
    const sw = await Promise.race([
      page.evaluate(async () => {
        const reg = await navigator.serviceWorker.ready;
        const active = reg.active;
        if (active && active.state !== 'activated') {
          await new Promise<void>((resolve) => {
            active.addEventListener('statechange', () => {
              if (active.state === 'activated') resolve();
            });
            if (active.state === 'activated') resolve();
          });
        }
        const regs = await navigator.serviceWorker.getRegistrations();
        return {
          state: reg.active?.state,
          scriptURL: reg.active?.scriptURL,
          scope: reg.scope,
          count: regs.length,
        };
      }),
      timeout,
    ]);
    expect(sw.state).toBe('activated');
    expect(sw.scriptURL).toBe(`${origin}/sw.js`);
    expect(sw.scope).toBe(`${origin}/`);
    expect(sw.count).toBe(1);
  });

  test('EZD-013 B2 PWA files need no session @smoke', async ({ page, request }) => {
    await page.goto('/sign-in');
    const apple = await attr(page, 'link[rel=apple-touch-icon]', 'href');
    const icon = await attr(page, 'link[rel=icon]', 'href');
    expect(apple).toBeTruthy();
    expect(icon).toBeTruthy();
    const urls = [
      '/manifest.webmanifest',
      '/sw.js',
      '/app-icons/icon-192.png',
      '/app-icons/icon-512.png',
      '/app-icons/icon-maskable-512.png',
      new URL(apple ?? '', page.url()).toString(),
      new URL(icon ?? '', page.url()).toString(),
    ];
    for (const u of urls) {
      const r = await request.get(u, { maxRedirects: 0 });
      expect(r.status(), u).toBe(200);
    }
  });

  test('EZD-013 B3 worker script headers', async ({ request }) => {
    const r = await request.get('/sw.js', { maxRedirects: 0 });
    expect(r.headers()['content-type']).toContain('javascript');
    expect(r.headers()['cache-control']).toContain('no-cache');
  });

  test(
    'EZD-013 B4 install tags on every page',
    { tag: ['@desktop', '@ipad', '@surface', '@phone'] },
    async ({ page }) => {
      for (const route of ['/sign-in', '/dev/shell']) {
        await page.goto(route);
        expect(await attr(page, 'meta[name=theme-color]', 'content'), route).toBe('#f6f7f9');
        await expect(page.locator('link[rel=manifest]')).toHaveCount(1);
        await expect(page.locator('link[rel=apple-touch-icon]')).toHaveCount(1);
        const apple = await attr(page, 'link[rel=apple-touch-icon]', 'href');
        const r = await page.request.get(new URL(apple ?? '', page.url()).toString());
        expect(r.status()).toBe(200);
        const { width, height } = ihdr(await r.body());
        expect([width, height]).toEqual([180, 180]);
        expect(await attr(page, 'meta[name=apple-mobile-web-app-title]', 'content')).toBe(
          'EZ Draft',
        );
        expect(
          await attr(page, 'meta[name=apple-mobile-web-app-status-bar-style]', 'content'),
        ).toBe('default');
        const capable = await page
          .locator('meta[name=apple-mobile-web-app-capable], meta[name=mobile-web-app-capable]')
          .evaluateAll((els) => els.map((e) => e.getAttribute('content')));
        expect(capable).toContain('yes');
        expect(await page.locator('link[rel=icon]').count()).toBeGreaterThanOrEqual(1);
      }
    },
  );
});

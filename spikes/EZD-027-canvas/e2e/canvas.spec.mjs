// EZD-027 B1-B4 (vault/plans/EZD-027.md Tests table). Frame times are never compared with a budget
// (11 Performance; R26 R10; KNOWN-LIMITS 7; Q-0018).
import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const OUT = path.join(import.meta.dirname, '..', 'out', 'test');

function filesFor(label, since) {
  let names = [];
  try {
    names = readdirSync(OUT);
  } catch {
    return [];
  }
  return names
    .filter((n) => n.startsWith(`results-${label}-`) && n.endsWith('.json'))
    .filter((n) => statSync(path.join(OUT, n)).mtimeMs >= since)
    .sort();
}

async function installCounter(page) {
  await page.addInitScript(() => {
    window.__ctxCount = 0;
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') window.__ctxCount++;
      return orig.call(this, type, ...rest);
    };
  });
}

async function waitDone(page) {
  await page.waitForFunction(
    () => ['done', 'error'].includes(document.documentElement.dataset.ezd027State),
    null,
    { timeout: 100000 },
  );
  const state = await page.evaluate(() => document.documentElement.dataset.ezd027State);
  if (state === 'error') throw new Error('page error: ' + (await page.locator('body').innerText()));
}

test.describe('EZD-027 plan canvas spike', () => {
  test('EZD-027 done when: the page runs its script and writes a results file', async ({ page }, testInfo) => {
    const project = testInfo.project.name;
    const label = `pw-${project}`;
    const start = Date.now();
    await installCounter(page);
    await page.goto(`/?autorun=1&runs=1&device=${label}`);
    await waitDone(page);
    await expect.poll(() => filesFor(label, start).length).toBeGreaterThan(0);
    const file = filesFor(label, start).at(-1);
    const r = JSON.parse(readFileSync(path.join(OUT, file), 'utf8'));
    const ratio = project === 'desktop' ? 1 : 2;
    const css = project === 'desktop' ? { w: 880, h: 846 } : { w: 460, h: 666 };

    expect(r.ticket).toBe('EZD-027');
    expect(r.schema).toBe(1);
    expect(r.measured.runs).toBe(1);
    expect(r.measured.passMs).toBe(3000);
    expect(r.measured.frames).toBeGreaterThanOrEqual(2);
    expect(r.measured.frameIntervalsMs.length).toBe(r.measured.frames - 1);
    for (const v of r.measured.frameIntervalsMs) expect(v).toBeGreaterThan(0);
    expect(r.warmup.frames).toBeGreaterThanOrEqual(2);

    for (const [k, v] of [['drawCalls', 21], ['lines', 150000], ['triangles', 64500]]) {
      expect(r.perFrame[k].min).toBe(v);
      expect(r.perFrame[k].max).toBe(v);
    }
    expect(r.rendererMemory.geometries).toBe(21);
    expect(r.rendererMemory.textures).toBe(1);
    expect(r.contextsCreated).toBe(1);
    expect(await page.evaluate(() => window.__ctxCount)).toBe(1);
    expect(r.canvases).toBe(1);
    expect(await page.evaluate(() => document.querySelectorAll('canvas').length)).toBe(1);
    expect(r.buffersRebuiltDuringScript).toBe(0);
    expect(r.idle.renders).toBe(0);

    expect(r.scene.segments).toBe(150000);
    expect(r.scene.lineLayers).toBe(10);
    expect(r.scene.symbols).toBe(3000);
    expect(r.scene.symbolTypes).toBe(10);
    expect(r.scene.labels).toBe(3000);
    expect(r.scene.glyphs).toBe(24000);
    expect(r.scene.atlas.width).toBeLessThanOrEqual(1024);
    expect(r.scene.atlas.height).toBeLessThanOrEqual(1024);
    expect(r.memory.linePositionBytes).toBe(3600000);
    expect(r.memory.textureBytes).toBe(r.scene.atlas.width * r.scene.atlas.height * r.scene.atlas.bytesPerTexel);

    expect(r.device.canvasCss).toEqual(css);
    expect(r.device.pixelRatioUsed).toBe(ratio);
    expect(r.device.drawingBuffer).toEqual({ w: Math.round(css.w * ratio), h: Math.round(css.h * ratio) });
    const box = await page.locator('canvas').boundingBox();
    expect(box.x).toBe(352);
    expect(box.y).toBe(92);

    expect(r.budgetsMs.desktop).toBeCloseTo(16.67, 2);
    expect(r.budgetsMs.ipad).toBeCloseTo(33.33, 2);
    expect(r.budgetsMs.maxFrame).toBeCloseTo(100, 2);
  });

  test.describe('desktop only', () => {
    test.beforeEach(({}, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'B2-B4 run in desktop only');
    });

    test('EZD-027 B2 numbers on screen', async ({ page }) => {
      const start = Date.now();
      await page.goto('/?autorun=1&runs=1&device=pw-desktop');
      await waitDone(page);
      await expect.poll(() => filesFor('pw-desktop', start).length).toBeGreaterThan(0);
      const file = filesFor('pw-desktop', start).at(-1);
      const r = JSON.parse(readFileSync(path.join(OUT, file), 'utf8'));
      const stat = (n) => page.locator(`[data-ezd027-stat=${n}]`);
      await expect(stat('frames')).toHaveText(String(r.measured.frames));
      for (const n of ['p95', 'mean', 'max']) await expect(stat(n)).toHaveText(r.measured.stats[n].toFixed(1));
      await expect(stat('drawCalls')).toHaveText('21');
      await expect(page.getByText(`Saved: ${file}`)).toBeVisible();
    });

    test('EZD-027 B3 download fallback', async ({ page }) => {
      const start = Date.now();
      await page.goto('/?autorun=1&runs=1&device=pw-desktop');
      await waitDone(page);
      await expect.poll(() => filesFor('pw-desktop', start).length).toBeGreaterThan(0);
      const file = filesFor('pw-desktop', start).at(-1);
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download results' }).click();
      const dl = await downloadPromise;
      expect(dl.suggestedFilename()).toMatch(/^EZD-027-results-pw-desktop-\d{8}T\d{9}Z\.json$/);
      const downloaded = JSON.parse(readFileSync(await dl.path(), 'utf8'));
      expect(downloaded).toEqual(JSON.parse(readFileSync(path.join(OUT, file), 'utf8')));
    });

    test('EZD-027 B4 run again reuses the canvas', async ({ page }) => {
      const start = Date.now();
      await installCounter(page);
      await page.goto('/?autorun=1&runs=1&device=pw-again');
      await waitDone(page);
      await expect.poll(() => filesFor('pw-again', start).length).toBe(1);
      await page.getByRole('button', { name: 'Run', exact: true }).click();
      await expect.poll(() => filesFor('pw-again', start).length, { timeout: 100000 }).toBe(2);
      await waitDone(page);
      expect(await page.evaluate(() => window.__ctxCount)).toBe(1);
      expect(await page.evaluate(() => document.querySelectorAll('canvas').length)).toBe(1);
      const [a, b] = filesFor('pw-again', start).map((n) => JSON.parse(readFileSync(path.join(OUT, n), 'utf8')));
      expect(b.rendererMemory.geometries).toBe(21);
      expect(b.rendererMemory.textures).toBe(1);
      expect(b.buildMs).toBe(a.buildMs);
    });
  });
});

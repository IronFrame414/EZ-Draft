// EZD-012c B1-B6 (vault/plans/EZD-012c.md section 4). Colors are compared against a probe element with the
// same var(--ez-*) declarations. No import.meta or __dirname (lesson L-017).
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../test-harness/e2e/test';

type Box = { x: number; y: number; width: number; height: number };

const region = (page: Page, name: string): Locator => page.locator(`[data-shell-region="${name}"]`);
const tool = (page: Page, id: string): Locator => page.locator(`[data-rail-tool="${id}"]`);
const tip = (page: Page, id: string): Locator =>
  page.locator(`[data-rail-tool="${id}"] + [data-rail-tooltip]`);

async function probe(page: Page, css: string): Promise<Record<string, string>> {
  return page.evaluate((style) => {
    const el = document.createElement('div');
    el.setAttribute('style', style);
    document.body.appendChild(el);
    const cs = getComputedStyle(el);
    const out = {
      backgroundColor: cs.backgroundColor,
      color: cs.color,
      boxShadow: cs.boxShadow,
      borderTopColor: cs.borderTopColor,
      fontFamily: cs.fontFamily,
    };
    el.remove();
    return out;
  }, css);
}

async function pixel(page: Page, png: Buffer, x: number, y: number): Promise<string> {
  const b64 = png.toString('base64');
  return page.evaluate(
    async ({ b64, x, y }) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), {
        colorSpaceConversion: 'none',
      });
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      const d = ctx.getImageData(x, y, 1, 1).data;
      return '#' + [d[0], d[1], d[2]].map((n) => n.toString(16).padStart(2, '0')).join('');
    },
    { b64, x, y },
  );
}

const styleOf = (l: Locator, props: string[]): Promise<Record<string, string>> =>
  l.evaluate((el, ps) => {
    const cs = getComputedStyle(el) as unknown as Record<string, string>;
    const out: Record<string, string> = {};
    for (const p of ps) out[p] = cs[p];
    return out;
  }, props);

async function box(l: Locator): Promise<Box> {
  const b = await l.boundingBox();
  if (!b) throw new Error('no box');
  return b;
}

const isShown = (l: Locator): Promise<boolean> =>
  l.evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return (
      cs.display !== 'none' &&
      cs.visibility !== 'hidden' &&
      Number(cs.opacity) > 0 &&
      r.width > 0 &&
      r.height > 0
    );
  });

test.describe('EZD-012c shell frame', () => {
  test('EZD-012c done when: empty editor at 1600 × 1000 matches the frame sizes', async ({
    page,
  }) => {
    await page.goto('/dev/shell');
    const expected: Record<string, Box> = {
      rail: { x: 16, y: 92, width: 56, height: 846 },
      'left-panel': { x: 88, y: 92, width: 248, height: 846 },
      canvas: { x: 352, y: 92, width: 880, height: 846 },
      inspector: { x: 1248, y: 92, width: 336, height: 846 },
      'status-bar': { x: 16, y: 954, width: 1568, height: 30 },
    };
    expect(await box(page.locator('[data-shell-region="frame"] > header'))).toEqual({
      x: 16,
      y: 16,
      width: 1568,
      height: 60,
    });
    for (const [name, b] of Object.entries(expected)) {
      expect(await box(region(page, name)), name).toEqual(b);
    }
    const scroll = await page.evaluate(() => ({
      w: document.documentElement.scrollWidth,
      h: document.documentElement.scrollHeight,
    }));
    expect(scroll).toEqual({ w: 1600, h: 1000 });
  });

  test('EZD-012c B2 grid', async ({ page }) => {
    await page.goto('/dev/shell');
    const canvas = await probe(page, 'background-color: var(--ez-canvas)');
    const s = await styleOf(region(page, 'frame'), ['backgroundSize', 'backgroundColor']);
    expect(s.backgroundSize).toBe('32px 32px, 32px 32px');
    expect(s.backgroundColor).toBe(canvas.backgroundColor);
    const png = await page.screenshot();
    expect(await pixel(page, png, 384, 500)).toBe('#e6e9ed');
    expect(await pixel(page, png, 400, 500)).toBe('#f6f7f9');
  });

  test('EZD-012c B3 card and status bar styles', async ({ page }) => {
    await page.goto('/dev/shell');
    const p = await probe(
      page,
      'background-color: var(--ez-surface); border-top: 1px solid var(--ez-border); box-shadow: var(--ez-shadow-card); font-family: var(--ez-font-mono)',
    );
    for (const name of ['rail', 'left-panel', 'inspector']) {
      const s = await styleOf(region(page, name), [
        'backgroundColor',
        'borderTopWidth',
        'borderTopColor',
        'borderRadius',
        'boxShadow',
      ]);
      expect(s.backgroundColor, name).toBe(p.backgroundColor);
      expect(s.borderTopWidth, name).toBe('1px');
      expect(s.borderTopColor, name).toBe(p.borderTopColor);
      expect(s.borderRadius, name).toBe('12px');
      expect(s.boxShadow, name).toBe(p.boxShadow);
    }
    const sb = await styleOf(region(page, 'status-bar'), [
      'backgroundColor',
      'borderTopWidth',
      'borderTopColor',
      'borderRadius',
      'boxShadow',
      'fontSize',
      'fontFamily',
    ]);
    expect(sb.backgroundColor).toBe(p.backgroundColor);
    expect(sb.borderTopWidth).toBe('1px');
    expect(sb.borderTopColor).toBe(p.borderTopColor);
    expect(sb.borderRadius).toBe('8px');
    expect(sb.boxShadow).toBe('none');
    expect(sb.fontSize).toBe('12px');
    expect(sb.fontFamily).toBe(p.fontFamily);
  });

  test('EZD-012c B4 rail buttons', async ({ page }) => {
    await page.goto('/dev/shell/rail');
    const tools = page.locator('[data-rail-tool]');
    await expect(tools).toHaveCount(3);
    expect(
      await tools.evaluateAll((els) => els.map((e) => e.getAttribute('data-rail-tool'))),
    ).toEqual(['select', 'cabinets', 'help']);
    for (const id of ['select', 'cabinets', 'help']) {
      const b = await box(tool(page, id));
      expect([b.width, b.height], id).toEqual([40, 40]);
    }
    const sel = await box(tool(page, 'select'));
    expect([sel.x, sel.y]).toEqual([24, 103]);
    const help = await box(tool(page, 'help'));
    expect([help.x, help.y]).toEqual([24, 887]);
    const sep = page.locator('[data-rail="separator"]');
    await expect(sep).toHaveCount(1);
    const sb = await box(sep);
    expect([sb.width, sb.height]).toEqual([24, 1]);
    const order = await page.evaluate(() => {
      const all = Array.from(
        document.querySelectorAll('[data-rail-tool], [data-rail="separator"]'),
      );
      return all.map((e) => e.getAttribute('data-rail-tool') ?? 'separator');
    });
    expect(order).toEqual(['select', 'separator', 'cabinets', 'help']);
    const attrs = async (name: string) =>
      Promise.all(['select', 'cabinets', 'help'].map((id) => tool(page, id).getAttribute(name)));
    expect(await attrs('aria-keyshortcuts')).toEqual(['V', 'C', '?']);
    expect(await attrs('aria-label')).toEqual(['Select', 'Cabinets', 'Help']);
  });

  test('EZD-012c B5 active tool', async ({ page }) => {
    await page.goto('/dev/shell/rail');
    const p = await probe(page, 'background-color: var(--ez-cobalt); color: var(--ez-surface)');
    const clear = 'rgba(0, 0, 0, 0)';
    const bg = async (id: string) =>
      (await styleOf(tool(page, id), ['backgroundColor'])).backgroundColor;

    await expect(tool(page, 'select')).toHaveAttribute('aria-pressed', 'true');
    expect(await bg('select')).toBe(p.backgroundColor);
    expect((await styleOf(tool(page, 'select'), ['color'])).color).toBe(p.color);
    for (const id of ['cabinets', 'help']) {
      await expect(tool(page, id)).toHaveAttribute('aria-pressed', 'false');
      expect(await bg(id), id).toBe(clear);
    }

    await tool(page, 'cabinets').click();
    await page.mouse.move(800, 500);
    await expect(tool(page, 'cabinets')).toHaveAttribute('aria-pressed', 'true');
    expect(await bg('cabinets')).toBe(p.backgroundColor);
    await expect(tool(page, 'select')).toHaveAttribute('aria-pressed', 'false');
    expect(await bg('select')).toBe(clear);
  });

  test('EZD-012c B6 tooltip on hover and focus', async ({ page }) => {
    await page.goto('/dev/shell/rail');
    const p = await probe(
      page,
      'background-color: var(--ez-ink); color: var(--ez-surface); font-family: var(--ez-font-mono)',
    );
    const slate = await probe(page, 'color: var(--ez-slate-300)');

    // (a) no pointer yet
    expect(await isShown(tip(page, 'cabinets'))).toBe(false);

    // (b) hover
    await tool(page, 'cabinets').hover();
    const t = tip(page, 'cabinets');
    await expect.poll(() => isShown(t)).toBe(true);
    const text = (await t.textContent()) ?? '';
    expect(text).toContain('Cabinets');
    expect(text).toContain('C');
    const tb = await box(t);
    const bb = await box(tool(page, 'cabinets'));
    expect(tb.x).toBe(76);
    expect(Math.abs(tb.y + tb.height / 2 - (bb.y + bb.height / 2))).toBeLessThanOrEqual(1);
    const ts = await styleOf(t, ['backgroundColor', 'color', 'fontSize', 'borderRadius']);
    expect(ts.backgroundColor).toBe(p.backgroundColor);
    expect(ts.color).toBe(p.color);
    expect(ts.fontSize).toBe('12px');
    expect(ts.borderRadius).toBe('6px');
    const ks = await styleOf(t.locator('kbd'), ['color', 'fontFamily']);
    expect(ks.color).toBe(slate.color);
    expect(ks.fontFamily).toBe(p.fontFamily);
    const top = await t.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!hit && (hit === el || el.contains(hit));
    });
    expect(top).toBe(true);

    // (c) pointer leaves
    await page.mouse.move(800, 500);
    await expect.poll(() => isShown(t)).toBe(false);

    // (d) keyboard focus
    let focused = false;
    for (let i = 0; i < 5 && !focused; i++) {
      await page.keyboard.press('Tab');
      focused = await tool(page, 'help').evaluate((el) => el === document.activeElement);
    }
    expect(focused).toBe(true);
    const h = tip(page, 'help');
    await expect.poll(() => isShown(h)).toBe(true);
    const ht = (await h.textContent()) ?? '';
    expect(ht).toContain('Help');
    expect(ht).toContain('?');
    expect(await isShown(tip(page, 'cabinets'))).toBe(false);
  });
});

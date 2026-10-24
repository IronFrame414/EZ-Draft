// EZD-014c B1-B8 (vault/plans/EZD-014c.md section 4). Colors are compared against a probe element with the
// same var(--ez-*) declarations; text comes from the en / es catalogs. No import.meta or __dirname (L-017).
import type { Locator, Page } from '@playwright/test';
import { expect, expectTouchTargets, test } from '../test-harness/e2e/test';
import { en } from '../src/server/messages/catalogs/en';
import { es } from '../src/server/messages/catalogs/es';

type Box = { x: number; y: number; width: number; height: number };

const region = (page: Page, name: string): Locator => page.locator(`[data-shell-region="${name}"]`);
const tool = (page: Page, id: string): Locator => page.locator(`[data-rail-tool="${id}"]`);
const tip = (page: Page, id: string): Locator =>
  page.locator(`[data-rail-tool="${id}"] + [data-rail-tooltip]`);
const header = (page: Page): Locator => page.locator('[data-shell-region="frame"] > header');
const frame = (page: Page): Locator => page.locator('[data-shell-region="frame"]');
const phoneFrame = (page: Page): Locator => page.locator('[data-phone-region="frame"]');
const headerButton = (page: Page, name: string): Locator =>
  page.getByRole('button', { name, exact: true });

const T = en as unknown as Record<string, string>;
const TES = es as unknown as Record<string, string>;

async function box(l: Locator): Promise<Box> {
  const b = await l.boundingBox();
  if (!b) throw new Error('no box');
  return b;
}

async function probe(page: Page, css: string): Promise<Record<string, string>> {
  return page.evaluate((style) => {
    const el = document.createElement('div');
    el.setAttribute('style', style);
    document.body.appendChild(el);
    const cs = getComputedStyle(el);
    const out = {
      backgroundColor: cs.backgroundColor,
      color: cs.color,
      borderTopColor: cs.borderTopColor,
    };
    el.remove();
    return out;
  }, css);
}

const styleOf = (l: Locator, props: string[]): Promise<Record<string, string>> =>
  l.evaluate((el, ps) => {
    const cs = getComputedStyle(el) as unknown as Record<string, string>;
    const out: Record<string, string> = {};
    for (const p of ps) out[p] = cs[p];
    return out;
  }, props);

const coarse = (page: Page): Promise<boolean> =>
  page.evaluate(() => window.matchMedia('(any-pointer: coarse)').matches);

type Dims = {
  W: number;
  H: number;
  helpY: number;
  maxRight: number;
  boxes: Record<string, Box>;
};

const IPAD: Dims = {
  W: 1180,
  H: 820,
  helpY: 703,
  maxRight: 1163,
  boxes: {
    rail: { x: 16, y: 92, width: 56, height: 666 },
    'left-panel': { x: 88, y: 92, width: 248, height: 666 },
    canvas: { x: 352, y: 92, width: 460, height: 666 },
    inspector: { x: 828, y: 92, width: 336, height: 666 },
    'status-bar': { x: 16, y: 774, width: 1148, height: 30 },
  },
};

const SURFACE: Dims = {
  W: 1440,
  H: 960,
  helpY: 843,
  maxRight: 1423,
  boxes: {
    rail: { x: 16, y: 92, width: 56, height: 806 },
    'left-panel': { x: 88, y: 92, width: 248, height: 806 },
    canvas: { x: 352, y: 92, width: 720, height: 806 },
    inspector: { x: 1088, y: 92, width: 336, height: 806 },
    'status-bar': { x: 16, y: 914, width: 1408, height: 30 },
  },
};

async function fullShellChecks(page: Page, d: Dims): Promise<void> {
  await page.goto('/dev/device');
  expect(await coarse(page)).toBe(true);
  await expect(frame(page)).toBeVisible();
  await expect(page.locator('[data-phone-region]')).toHaveCount(0);
  expect(await box(header(page))).toEqual({ x: 16, y: 16, width: d.W - 32, height: 60 });
  for (const [name, b] of Object.entries(d.boxes)) {
    expect(await box(region(page, name)), name).toEqual(b);
  }
  const scroll = await page.evaluate(() => ({
    w: document.documentElement.scrollWidth,
    h: document.documentElement.scrollHeight,
  }));
  expect(scroll).toEqual({ w: d.W, h: d.H });

  const tools = page.locator('[data-rail-tool]');
  await expect(tools).toHaveCount(3);
  for (const id of ['select', 'cabinets', 'help']) {
    const b = await box(tool(page, id));
    expect([b.width, b.height, b.x], id).toEqual([44, 44, 22]);
  }
  expect((await box(tool(page, 'select'))).y).toBe(103);
  expect((await box(tool(page, 'help'))).y).toBe(d.helpY);

  const tabs = header(page).locator('nav button');
  await expect(tabs).toHaveCount(4);
  for (const b of await Promise.all((await tabs.all()).map(box))) {
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBe(58);
  }
  for (const name of [
    T['office.header.share'],
    T['office.header.export'],
    T['office.header.issue_set'],
  ]) {
    expect((await box(headerButton(page, name))).height, name).toBeGreaterThanOrEqual(44);
  }
  const links = header(page).locator('a[href]');
  await expect(links).toHaveCount(1);
  expect((await box(links)).height).toBeGreaterThanOrEqual(44);

  expect(await expectTouchTargets(page, frame(page))).toBe(12);

  const edges = await header(page)
    .locator('a[href], button')
    .evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, right: r.x + r.width };
      }),
    );
  expect(edges).toHaveLength(9);
  for (const e of edges) {
    expect(e.x).toBeGreaterThanOrEqual(17);
    expect(e.right).toBeLessThanOrEqual(d.maxRight);
  }
}

test.describe('EZD-014c device layouts', () => {
  test(
    'EZD-014c done when: shell renders on iPad landscape with 44 px targets @smoke',
    { tag: ['@ipad'] },
    async ({ page }) => {
      await fullShellChecks(page, IPAD);
    },
  );

  test(
    'EZD-014c done when: phone shows the simple layout @smoke',
    { tag: ['@phone'] },
    async ({ page }) => {
      await page.goto('/dev/device');
      expect(await coarse(page)).toBe(true);
      await expect(phoneFrame(page)).toBeVisible();
      expect(await box(phoneFrame(page))).toEqual({ x: 0, y: 0, width: 390, height: 844 });
      await expect(page.locator('[data-shell-region]')).toHaveCount(0);
      await expect(page.locator('[data-rail-tool]')).toHaveCount(0);
      await expect(page.locator('aside')).toHaveCount(0);

      const hdr = page.locator('[data-phone-region="header"]');
      const hb = await box(hdr);
      expect(hb.y).toBe(0);
      expect(hb.width).toBe(390);
      const p = await probe(
        page,
        'background-color: var(--ez-surface); border-top: 1px solid var(--ez-border); color: var(--ez-slate-500)',
      );
      const hs = await styleOf(hdr, ['backgroundColor', 'borderBottomWidth', 'borderBottomColor']);
      expect(hs.backgroundColor).toBe(p.backgroundColor);
      expect(hs.borderBottomWidth).toBe('1px');
      expect(hs.borderBottomColor).toBe(p.borderTopColor);

      const title = page.locator('[data-phone-title]');
      await expect(title).toHaveText('Sample project');
      const ts = await styleOf(title, ['fontSize', 'fontWeight']);
      expect(ts.fontSize).toBe('17px');
      expect(ts.fontWeight).toBe('600');
      const sub = page.locator('[data-phone-subtitle]');
      await expect(sub).toHaveText('Sample client · Working copy');
      const ss = await styleOf(sub, ['fontSize', 'color']);
      expect(ss.fontSize).toBe('12px');
      expect(ss.color).toBe(p.color);

      const mb = await box(page.locator('[data-phone-region="main"]'));
      expect(mb.y).toBe(hb.y + hb.height);
      expect(mb.y + mb.height).toBe(844);
      await expect(page.locator('[data-phone-notice]')).toHaveText(
        T['field.device.editor_on_phone'],
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

      await page.goto('/dev/shell');
      await expect(phoneFrame(page)).toBeVisible();
      await expect(frame(page)).toHaveCount(0);
    },
  );

  test('EZD-014c B3 phone notice in Spanish', { tag: ['@phone'] }, async ({ page }) => {
    const want = TES['field.device.editor_on_phone'];
    expect(want).toBeTruthy();
    expect(want).not.toBe(T['field.device.editor_on_phone']);
    await page.goto('/dev/device?lang=es');
    const notice = page.locator('[data-phone-notice]');
    await expect(notice).toHaveText(want);
    expect(await notice.evaluate((el) => el.closest('[lang="es"]') !== null)).toBe(true);
  });

  test('EZD-014c B4 desktop unchanged, icons below 1600 px', async ({ page }) => {
    await page.goto('/dev/device');
    expect(await coarse(page)).toBe(false);
    await expect(frame(page)).toBeVisible();
    await expect(page.locator('[data-phone-region]')).toHaveCount(0);
    expect(await box(header(page))).toEqual({ x: 16, y: 16, width: 1568, height: 60 });
    expect(await box(tool(page, 'select'))).toEqual({ x: 24, y: 103, width: 40, height: 40 });
    const share = headerButton(page, T['office.header.share']);
    const exp = headerButton(page, T['office.header.export']);
    for (const [b, key] of [
      [share, 'office.header.share'],
      [exp, 'office.header.export'],
    ] as const) {
      await expect(b.locator('[data-header-button-label]')).toBeVisible();
      await expect(b.locator('[data-header-button-label]')).toHaveText(T[key]);
      await expect(b.locator('[data-header-button-icon]')).toBeHidden();
    }
    await page.setViewportSize({ width: 1599, height: 1000 });
    for (const b of [share, exp]) {
      await expect(b.locator('[data-header-button-label]')).toBeHidden();
      await expect(b.locator('[data-header-button-icon]')).toBeVisible();
    }
    await expect(
      headerButton(page, T['office.header.issue_set']).getByText(T['office.header.issue_set']),
    ).toBeVisible();
  });

  test('EZD-014c B5 layout switches live at 1024 px', { tag: ['@ipad'] }, async ({ page }) => {
    await page.goto('/dev/device');
    const url = page.url();
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__ezdMarker = 1;
    });
    const steps: Array<[number, number, 'full' | 'phone']> = [
      [1024, 820, 'full'],
      [1023, 820, 'phone'],
      [1180, 820, 'full'],
      [390, 844, 'phone'],
      [1180, 820, 'full'],
    ];
    for (const [width, height, want] of steps) {
      await page.setViewportSize({ width, height });
      if (want === 'full') {
        await expect(frame(page), `${width}`).toBeVisible();
        await expect(phoneFrame(page), `${width}`).toHaveCount(0);
      } else {
        await expect(phoneFrame(page), `${width}`).toBeVisible();
        await expect(frame(page), `${width}`).toHaveCount(0);
      }
      expect(page.url()).toBe(url);
      expect(
        await page.evaluate(() => (window as unknown as Record<string, unknown>).__ezdMarker),
      ).toBe(1);
    }
  });

  test('EZD-014c B6 no sticky hover after a tap', { tag: ['@ipad'] }, async ({ page }) => {
    await page.goto('/dev/device');
    await expect(async () => {
      await tool(page, 'cabinets').tap();
      await expect(tool(page, 'cabinets')).toHaveAttribute('aria-pressed', 'true', {
        timeout: 250,
      });
    }).toPass();
    await expect(tip(page, 'cabinets')).toHaveCount(1);
    await expect(tip(page, 'cabinets')).toBeHidden();
    await tool(page, 'select').tap();
    await expect(tool(page, 'select')).toHaveAttribute('aria-pressed', 'true');
    await expect(tip(page, 'select')).toHaveCount(1);
    await expect(tip(page, 'select')).toBeHidden();
    await expect(tool(page, 'cabinets')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  });

  test(
    'EZD-014c B7 icon-only Share and Export',
    { tag: ['@ipad', '@surface'] },
    async ({ page }) => {
      await page.goto('/dev/device');
      for (const [key, icon] of [
        ['office.header.share', 'share'],
        ['office.header.export', 'download'],
      ] as const) {
        const b = headerButton(page, T[key]);
        await expect(b).toHaveCount(1);
        await expect(b.locator('[data-header-button-label]')).toBeHidden();
        await expect(b.locator('[data-header-button-icon]')).toBeVisible();
        await expect(b.locator('[data-header-button-icon] use')).toHaveAttribute(
          'href',
          `/icons/sprite.svg#${icon}`,
        );
        await expect(b).toHaveAttribute('aria-label', T[key]);
        await expect(b).toHaveAttribute('title', T[key]);
        const bb = await box(b);
        expect(bb.width).toBeGreaterThanOrEqual(44);
        expect(bb.height).toBeGreaterThanOrEqual(44);
      }
      const issue = headerButton(page, T['office.header.issue_set']);
      await expect(issue.getByText(T['office.header.issue_set'])).toBeVisible();
      const ib = await box(issue);
      expect(ib.width).toBeGreaterThanOrEqual(44);
      expect(ib.height).toBeGreaterThanOrEqual(44);
      expect(await expectTouchTargets(page, header(page))).toBe(9);
    },
  );

  test(
    'EZD-014c B8 Surface shows the full shell with 44 px targets',
    { tag: ['@surface'] },
    async ({ page }) => {
      await fullShellChecks(page, SURFACE);
    },
  );
});

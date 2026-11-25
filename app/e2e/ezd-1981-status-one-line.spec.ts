// EZD-1981 (AC-EZD-1981-1, -2; audit/ui-live-2026-11-24/REPORT.md F5): at 1600 x 1000 (desktop) and on the iPad
// profile (1180 x 820), every status bar cell in Plan, Electrical, Ceiling and Countertops is one line tall. A cell
// that runs out of room is cut with an ellipsis and has its full text as a tooltip; no cell spills out of the bar or
// over its neighbour. Tagged @desktop @ipad so it runs in both projects. Every test makes its own company (never
// tenant 1) with fixture S and its own member. No import.meta or __dirname (lesson L-017).
import type { Locator, Page } from '@playwright/test';
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

const EDITOR = ['view_projects', 'edit_model'];

const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const bar = (page: Page) => page.locator('[data-shell-region="status-bar"]');

async function fixtureS() {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const m = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, m.membershipId, EDITOR as never);
  return { ids, user: m };
}

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}

type Cell = {
  text: string;
  lines: number[];
  left: number;
  right: number;
  top: number;
  bottom: number;
  cut: boolean;
  title: string | null;
  full: string;
};

// Each status cell: the distinct line tops of its label and value text (a wrapped line starts about 16 px lower),
// its box, and whether its value is cut (scrollWidth over clientWidth) with the tooltip it carries.
async function cells(page: Page): Promise<{ bar: DOMRect; cells: Cell[] }> {
  return bar(page).evaluate((footer) => {
    const lineTops = (el: Element) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const tops: number[] = [];
      for (const r of Array.from(range.getClientRects())) {
        if (r.width === 0 || r.height === 0) continue;
        if (!tops.some((t) => Math.abs(t - r.top) < 4)) tops.push(r.top);
      }
      return tops;
    };
    const out = Array.from(footer.querySelectorAll('[data-status-item]')).map((item) => {
      const value = item.querySelector('[data-status-value]');
      const parts = [item.querySelector('[data-status-label]'), value].filter(
        (e): e is Element => e !== null,
      );
      const lines =
        parts.length === 0 ? [lineTops(item).length] : parts.map((p) => lineTops(p).length);
      const box = item.getBoundingClientRect();
      const cut = value instanceof HTMLElement && value.scrollWidth > value.clientWidth + 1;
      return {
        text: (item.textContent ?? '').trim(),
        lines,
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        cut,
        title: value?.getAttribute('title') ?? null,
        full: (value?.textContent ?? '').trim(),
      };
    });
    return { bar: footer.getBoundingClientRect().toJSON() as DOMRect, cells: out };
  });
}

async function expectOneLine(page: Page, tool: string) {
  const { bar: b, cells: list } = await cells(page);
  expect(list.length, `${tool}: status cells`).toBeGreaterThan(0);
  for (const c of list) {
    for (const n of c.lines) expect(n, `${tool}: "${c.text}" is one line`).toBeLessThanOrEqual(1);
    expect(c.left, `${tool}: "${c.text}" inside the bar`).toBeGreaterThanOrEqual(b.left - 1);
    expect(c.right, `${tool}: "${c.text}" inside the bar`).toBeLessThanOrEqual(b.right + 1);
    expect(c.top, `${tool}: "${c.text}" inside the bar`).toBeGreaterThanOrEqual(b.top - 1);
    expect(c.bottom, `${tool}: "${c.text}" inside the bar`).toBeLessThanOrEqual(b.bottom + 1);
    if (c.cut)
      expect(c.title, `${tool}: cut "${c.text}" has its full text as tooltip`).toBe(c.full);
  }
  const sorted = [...list].sort((p, q) => p.left - q.left);
  for (let i = 1; i < sorted.length; i++) {
    expect(
      sorted[i].left,
      `${tool}: "${sorted[i].text}" clear of "${sorted[i - 1].text}"`,
    ).toBeGreaterThanOrEqual(sorted[i - 1].right - 1);
  }
}

test.describe('EZD-1981 status bar cells stay on one line @desktop @ipad', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-1981-2: Plan, Electrical, Ceiling and Countertops status cells are one line tall', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);

    // Plan: Scale 1/2" = 1'-0" is whole, never cut.
    await expect(id(page, 'status-scale').locator('[data-status-value]')).toHaveText(
      `1/2" = 1'-0"`,
    );
    await expectOneLine(page, 'Plan');
    const scale = id(page, 'status-scale');
    expect(
      await scale.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      'Scale is not cut',
    ).toBe(true);

    // Electrical: Layer "Power + lighting", Code "NEC 2023 · FBC 9th ed.".
    await page.keyboard.press('e');
    await expect(id(page, 'status-electrical-layer')).toHaveText('Power + lighting');
    await expect(id(page, 'status-electrical-code')).toHaveText('NEC 2023 · FBC 9th ed.');
    await expectOneLine(page, 'Electrical');
    await page.keyboard.press('Escape');
    await expect(id(page, 'status-electrical-layer')).toHaveCount(0);

    // Countertops: Exposed edge.
    await page.keyboard.press('k');
    await expect(id(page, 'status-countertop-exposed')).toHaveText('0 lf');
    await expectOneLine(page, 'Countertops');
    await page.keyboard.press('Escape');
    await expect(id(page, 'status-countertop-exposed')).toHaveCount(0);

    // Ceiling (Both): View and Joists "unknown · beam clash checks off".
    await id(page, 'surface-both').click();
    await expect(id(page, 'surface-both')).toHaveAttribute('aria-pressed', 'true');
    await expect(id(page, 'status-joists')).toHaveText('unknown · beam clash checks off');
    await expectOneLine(page, 'Ceiling');
  });
});

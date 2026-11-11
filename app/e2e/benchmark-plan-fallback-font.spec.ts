// EZD-374 B1 (vault/plans/EZD-374.md section 4; AC-EZD-374-1). Project desktop (untagged), signed out. The page and
// the wait are the perf check's (scripts/perf/pan-script.mjs); the unloadable faces are EZD-373 F1's.
import { expect, test } from '../test-harness/e2e/test';

type Win = { __ezdraftPlan?: { stats(): { glyphs: number } } };

test.describe('EZD-374 benchmark plan without the fallback fonts', () => {
  test('EZD-374 B1 the benchmark plan meets the perf wait when the fallback font faces cannot load', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.addInitScript(() => {
      for (const family of ['dmMono Fallback', 'instrumentSans Fallback']) {
        document.fonts.add(new FontFace(family, "local('ezd373-no-such-font')"));
      }
    });
    await page.goto('/dev/benchmark-plan');
    await expect(page.locator('[data-perf-wait-plan]')).toHaveCount(1);

    const vars = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        mono: s.getPropertyValue('--ez-font-mono'),
        sans: s.getPropertyValue('--ez-font-sans'),
      };
    });
    expect(vars.mono).toContain('dmMono Fallback');
    expect(vars.sans).toContain('instrumentSans Fallback');
    const settle = (font: string) =>
      page.evaluate(
        (f) =>
          document.fonts.load(f).then(
            () => 'fulfilled',
            () => 'rejected',
          ),
        font,
      );
    expect(await settle("400 40px 'dmMono Fallback'")).toBe('rejected');
    expect(await settle("600 40px 'instrumentSans Fallback'")).toBe('rejected');

    await page.waitForFunction(
      (sel) =>
        document.querySelector(sel) !== null &&
        (window as unknown as Win).__ezdraftPlan !== undefined &&
        (window as unknown as Win).__ezdraftPlan!.stats().glyphs > 0,
      '[data-testid="plan-canvas"][data-plan-state="ready"]',
      { timeout: 30000, polling: 100 },
    );
    const glyphs = await page.evaluate(() => (window as unknown as Win).__ezdraftPlan!.stats().glyphs);
    expect(glyphs).toBeGreaterThan(0);
  });
});

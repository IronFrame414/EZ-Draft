// Copies of plan-zoom-hover-text.spec.ts helpers (EZD-207b).
// EZD-373 F1 (vault/plans/EZD-373.md section 4; AC-EZD-373-1). Project desktop (untagged). Own company with fixture S and
// its own member. No import.meta or __dirname (lesson L-017).
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
import type { Page } from '@playwright/test';
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

type Win = {
  __ezdraftPlan: { stats(): { glyphs: number } };
  __ezdraftEditor: {
    objects(): Array<{ id: string; type: string }>;
    edit(changes: Array<object>): string[];
  };
};

async function fixtureS() {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const m = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, m.membershipId, ['view_projects', 'edit_model'] as never);
  return { ids, user: m };
}

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByTestId('editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(page.getByTestId('plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}

const glyphs = (page: Page) =>
  page.evaluate(() => (window as unknown as Win).__ezdraftPlan.stats().glyphs);

async function addR1(page: Page): Promise<void> {
  await page.evaluate((version) => {
    const w = window as unknown as Win;
    const floor = w.__ezdraftEditor.objects().find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    w.__ezdraftEditor.edit([
      {
        id: crypto.randomUUID(),
        value: {
          type: 'room',
          schemaVersion: version,
          data: {
            geometry: {
              boundary: [
                { x: 0, y: 0 },
                { x: 141.5, y: 0 },
                { x: 141.5, y: 168 },
                { x: 0, y: 168 },
              ],
            },
            status: 'existing',
            level: floor.id,
            attributes: { name: 'Kitchen', floorLevel: 0, photos: [] },
            closureOverride: null,
          },
        },
      },
    ]);
  }, CURRENT_SCHEMA_VERSION);
}

test.describe('EZD-373 plan text without the fallback fonts', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-373 F1 the room label is drawn when the fallback font faces cannot load', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(60_000);
    await page.addInitScript(() => {
      for (const family of ['dmMono Fallback', 'instrumentSans Fallback']) {
        document.fonts.add(new FontFace(family, "local('ezd373-no-such-font')"));
      }
    });
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);

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

    expect(await glyphs(page)).toBe(0);
    await addR1(page);
    await expect.poll(() => glyphs(page)).toBe(13);
  });
});

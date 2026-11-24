// EZD-415 (AC-EZD-415-1 "A 76 1/2" side at 12" with a 10" limit and 24" bracket spacing and 24" seat width shows the
// notice with 4 brackets and 3 seats"; S04b Controls "Support notice ... Shown when seating overhang exceeds limit",
// "Seats row"; S15d "Seating overhang support limit ... Empty = support check off, with a "Set in Defaults" notice";
// wording in vault/build/assumptions.md EZD-415). Desktop 1600 x 1000. Each test makes its own company (never
// tenant 1) with fixture S and its own member. The company Defaults are set as fixture input. The board island is
// seeded through the editor hook (as countertops-overhangs.spec.ts): a 76 1/2 × 27 top. Hand counts: the back is
// 76 1/2" long, ceil(76.5 / 24) = 4 brackets, floor(76.5 / 24) = 3 seats. Helpers are copies of
// countertops-overhangs.spec.ts. No import.meta or __dirname (L-017).
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
import type { Locator, Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  harnessSql,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { seedFixtureS } from '../test-harness/projects-fixture';

const EDITOR = ['view_projects', 'edit_model'];

async function fixtureS(permissions: string[]) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, permissions as never);
  return { tenant, ids, user };
}

type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = { __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] } };
type P = { x: number; y: number };
type Edge = { kind: string; overhang: number };
type PieceData = { geometry: { outline: P[] }; attributes: { edges: Edge[]; support?: unknown } };

const editorState = (page: Page) => page.getByTestId('editor-state');
const id = (page: Page, testId: string): Locator => page.getByTestId(testId);

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}
const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

async function seedIsland(page: Page): Promise<string> {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((x) => x.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const pieceId = crypto.randomUUID();
  const edge = { kind: 'exposed', overhang: 1.5, backsplashHeight: null, profileId: null };
  const change = {
    id: pieceId,
    value: {
      type: 'countertop_piece',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: {
        geometry: {
          outline: [
            { x: 0, y: 120 },
            { x: 76.5, y: 120 },
            { x: 76.5, y: 147 },
            { x: 0, y: 147 },
          ],
        },
        status: 'new',
        level,
        attributes: {
          label: 'C',
          name: 'Island',
          materialItemId: null,
          thickness: 3 / 2.54,
          edges: [edge, edge, edge, edge],
        },
      },
    },
  };
  const done = await page.evaluate((c) => (window as unknown as Window2).__ezdraftEditor.edit([c]), change);
  expect(done.length).toBeGreaterThan(0);
  return pieceId;
}

const pieceData = (page: Page, pieceId: string) =>
  page.evaluate(
    (pid) =>
      (window as unknown as Window2).__ezdraftEditor.objects().find((o) => o.id === pid)
        ?.data as unknown as PieceData,
    pieceId,
  );
const chip = (page: Page, edge: number) =>
  page.locator(`[data-testid="countertop-overhang-chip"][data-label="C"][data-edge="${edge}"]`);

test.describe('EZD-415 Seating support check', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-415-1 a 76 1/2" side at 12" past a 10" limit shows 4 brackets and 3 seats', async ({
    page,
    signInAs,
  }) => {
    const { tenant, ids: project, user } = await fixtureS(EDITOR);
    await harnessSql()`update public.tenant
      set defaults = coalesce(defaults, '{}'::jsonb)
        || '{"seating_support_limit": 10, "countertop_bracket_spacing": 24, "countertop_seat_width": 24}'::jsonb
      where id = ${tenant}::uuid`;
    await signInAs(user.email);
    await openReady(page, project.P1);
    const pieceId = await seedIsland(page);
    await saved(page);

    await page.keyboard.press('k');
    await chip(page, 0).click();
    await page.keyboard.press('Escape');
    await expect(id(page, 'countertop-piece-inspector')).toBeVisible();
    // A top with no seating side shows neither row.
    await expect(id(page, 'countertop-seats')).toHaveCount(0);

    await id(page, 'countertop-preset-seating').click();
    await expect(id(page, 'countertop-side-input-back')).toHaveValue('12"');
    await expect(id(page, 'countertop-support-text')).toHaveText(
      '12" overhang needs support. 4 steel brackets at 24" o.c.',
    );
    await expect(id(page, 'countertop-seats-value')).toHaveText('3 at 24" spacing');
    expect((await pieceData(page, pieceId)).attributes.support).toEqual({ overhang: 12, brackets: 4, spacing: 24 });
    await saved(page);

    // Back to Standard: no seating side, no notice, no requirement.
    await id(page, 'countertop-preset-standard').click();
    await expect(id(page, 'countertop-support-notice')).toHaveCount(0);
    expect((await pieceData(page, pieceId)).attributes.support).toBeUndefined();
  });

  test('with the limit Not set the check is off and asks for it in Defaults', async ({ page, signInAs }) => {
    const { ids: project, user } = await fixtureS(EDITOR);
    await signInAs(user.email);
    await openReady(page, project.P1);
    await seedIsland(page);
    await saved(page);

    await page.keyboard.press('k');
    await chip(page, 0).click();
    await page.keyboard.press('Escape');
    await id(page, 'countertop-preset-seating').click();
    await expect(id(page, 'countertop-side-input-back')).toHaveValue('12"');
    // No Settings → Defaults: the line to ask instead of the link.
    await expect(id(page, 'countertop-support-notice')).toContainText('Seating support check is off.');
    await expect(id(page, 'countertop-support-notice').getByTestId('set-in-defaults-ask')).toBeVisible();
    await expect(id(page, 'countertop-seats').getByTestId('set-in-defaults-ask')).toBeVisible();
  });
});

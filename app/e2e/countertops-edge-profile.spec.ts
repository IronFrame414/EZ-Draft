// EZD-417 (AC-EZD-417-1 "An offered total equals rate × exposed LF"; S04b Controls "Edge profile card", "Offered
// profile rows | ... price per lf × exposed edge length | Price hidden without See sell prices", "Edit offered edges |
// ... | Requires Send to client", "Edge profile status pill ("Edge profile: client choosing")"; R24 #33; board
// S04bCountertops). Desktop 1600 x 1000. Each test makes its own company (never tenant 1) with fixture S and its own
// member. The board island (76 1/2 × 37 1/2, seating back, every side exposed) is seeded through the editor hook;
// hand counts: exposed 2 × (76.5 + 37.5) = 228" = 19 LF; half bullnose at $12/lf → +$228.00; ogee at $18.50/lf →
// +$351.50. Helpers are copies of countertops-overhangs.spec.ts. No import.meta or __dirname (L-017).
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
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
type Edge = { kind: string; overhang: number; profileId: string | null };
type PieceData = { geometry: { outline: P[] }; attributes: { edges: Edge[] } };

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
  const edge = (kind: string) => ({
    kind,
    overhang: kind === 'seating' ? 12 : 1.5,
    backsplashHeight: null,
    profileId: null,
  });
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
            { x: 76.5, y: 157.5 },
            { x: 0, y: 157.5 },
          ],
        },
        status: 'new',
        level,
        attributes: {
          label: 'C',
          name: 'Island',
          materialItemId: null,
          thickness: 3 / 2.54,
          edges: [edge('exposed'), edge('exposed'), edge('seating'), edge('exposed')],
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
const row = (page: Page, key: string) => page.locator(`[data-testid="edit-offered-row"][data-key="${key}"]`);
const offered = (page: Page) =>
  id(page, 'edge-offered-row').evaluateAll((rows) =>
    rows.map((r) =>
      Array.from(r.querySelectorAll('span'), (x) => (x.textContent ?? '').trim())
        .filter((x) => x !== '')
        .join(' '),
    ),
  );

async function openIsland(page: Page) {
  await page.keyboard.press('k');
  await expect(id(page, 'countertops')).toBeVisible();
  await chip(page, 0).click();
  await page.keyboard.press('Escape');
  await expect(id(page, 'countertop-inspector-title')).toHaveText('Island top');
}

test.describe('EZD-417 Edge profiles', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-417-1 an offered total equals rate × exposed LF', async ({ page, signInAs }) => {
    const { ids: project, user } = await fixtureS([...EDITOR, 'send_to_client', 'see_sell_prices']);
    await signInAs(user.email);
    await openReady(page, project.P1);
    const pieceId = await seedIsland(page);
    await saved(page);
    await openIsland(page);

    await expect(id(page, 'edge-profile-pill')).toHaveText('Edge profile: not offered');
    await expect(id(page, 'edge-profile-card')).toContainText('Exposed edges only');
    await expect(id(page, 'edge-profile-name')).toHaveText('No profile set');

    // Pick a profile: every exposed edge takes it.
    await id(page, 'edge-profile-select').selectOption({ label: 'Eased' });
    await expect(id(page, 'edge-profile-name')).toHaveText('Eased');
    const data = await pieceData(page, pieceId);
    const ids = new Set(data.attributes.edges.map((e) => e.profileId));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toMatch(/^[0-9a-f-]{36}$/);
    await saved(page);

    // Edit offered edges: the full library, ticked with a price per lf each.
    await id(page, 'countertop-edit-offered').click();
    await expect(id(page, 'edit-offered-edges')).toBeVisible();
    await expect(id(page, 'edit-offered-exposed')).toHaveText('Exposed edge 19 lf');
    await expect(id(page, 'edit-offered-row')).toHaveCount(7);
    await row(page, 'eased').getByTestId('edit-offered-tick').check();
    await row(page, 'half_bullnose').getByTestId('edit-offered-tick').check();
    await row(page, 'half_bullnose').getByTestId('edit-offered-rate').fill('12');
    await row(page, 'ogee').getByTestId('edit-offered-tick').check();
    await row(page, 'ogee').getByTestId('edit-offered-rate').fill('18.50');
    await expect(row(page, 'eased').getByTestId('edit-offered-total')).toHaveText('Included');
    await expect(row(page, 'half_bullnose').getByTestId('edit-offered-total')).toHaveText('+$228.00');
    await expect(row(page, 'ogee').getByTestId('edit-offered-total')).toHaveText('+$351.50');
    await id(page, 'edit-offered-save').click();
    await expect(id(page, 'edit-offered-edges')).toHaveCount(0);

    await expect(id(page, 'edge-profile-card')).toHaveAttribute('data-state', 'open');
    await expect(id(page, 'edge-profile-name')).toHaveText('Client choosing');
    await expect(id(page, 'edge-profile-state')).toHaveText('Open');
    await expect.poll(() => offered(page)).toEqual(['Eased Included', 'Half bullnose +$228.00', 'Ogee +$351.50']);
    await expect(id(page, 'edge-profile-pill')).toHaveText('Edge profile: client choosing');

    // The offer is saved: a reload reads it back.
    await openReady(page, project.P1);
    await openIsland(page);
    await expect.poll(() => offered(page)).toEqual(['Eased Included', 'Half bullnose +$228.00', 'Ogee +$351.50']);
  });

  test('without See sell prices no price shows; without Send to client no Edit offered edges', async ({
    page,
    signInAs,
  }) => {
    const { ids: project, user } = await fixtureS([...EDITOR, 'send_to_client']);
    await signInAs(user.email);
    await openReady(page, project.P1);
    await seedIsland(page);
    await saved(page);
    await openIsland(page);

    await id(page, 'countertop-edit-offered').click();
    await expect(id(page, 'edit-offered-rate')).toHaveCount(0);
    await row(page, 'bevel').getByTestId('edit-offered-tick').check();
    await id(page, 'edit-offered-save').click();
    await expect(id(page, 'edit-offered-edges')).toHaveCount(0);
    await expect.poll(() => offered(page)).toEqual(['Bevel']);
    await expect(id(page, 'edge-offered-price')).toHaveCount(0);
    const res = await page.request.get(`/api/projects/${project.P1}/edge-offer`);
    expect(await res.text()).not.toContain('ratePerLf');

    const viewer = await fixtureS(EDITOR);
    await signInAs(viewer.user.email);
    await openReady(page, viewer.ids.P1);
    await seedIsland(page);
    await saved(page);
    await openIsland(page);
    await expect(id(page, 'edge-profile-card')).toBeVisible();
    await expect(id(page, 'countertop-edit-offered')).toHaveCount(0);
  });
});

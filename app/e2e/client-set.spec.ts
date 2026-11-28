// EZD-720 (AC-EZD-720-1 "Switching to the Client set shows the countertop sheets"; AC-EZD-720-2 "the Permit set never
// contains them"; vault/build/assumptions/EZD-720.md Settled: A8.0 Countertop plan with the TOP SCHEDULE and A9.0 Edge
// details join the client set with the first countertop piece). Desktop 1600 x 1000. Its own company (never tenant 1)
// with fixture S and its own member. The board's three tops (EZD-418, countertops-top-schedule.spec.ts) are seeded
// through the editor hook; the schedule values are its hand counts (A 25.1 sq ft, 9.7 lf). Helpers are copies of
// countertops-top-schedule.spec.ts. No import.meta or __dirname (L-017).
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

const editorState = (page: Page) => page.getByTestId('editor-state');
const id = (page: Page, testId: string): Locator => page.getByTestId(testId);

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}
const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

type P = { x: number; y: number };
type Kind = 'exposed' | 'wall' | 'seating' | 'seam';

async function seedBoardTops(page: Page) {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((x) => x.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const seam = crypto.randomUUID();
  const edge = (kind: Kind) =>
    kind === 'seam'
      ? { kind: 'wall', overhang: 0, backsplashHeight: null, profileId: null, seamId: seam }
      : {
          kind,
          overhang: kind === 'seating' ? 12 : kind === 'exposed' ? 1.5 : 0,
          backsplashHeight: kind === 'wall' ? 4 : null,
          profileId: null,
        };
  const piece = (label: string, name: string, outline: P[], kinds: Kind[]) => ({
    id: crypto.randomUUID(),
    value: {
      type: 'countertop_piece',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: {
        geometry: { outline },
        status: 'new',
        level,
        attributes: { label, name, materialItemId: null, thickness: 3 / 2.54, edges: kinds.map(edge) },
      },
    },
  });
  const rect = (x0: number, y0: number, x1: number, y1: number): P[] => [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
  const changes = [
    piece(
      'A',
      'Back wall',
      [
        { x: 0, y: 0 },
        { x: 141.5, y: 0 },
        { x: 141.5, y: 25.5 },
        { x: 25.5, y: 25.5 },
        { x: 0, y: 25.5 },
      ],
      ['wall', 'wall', 'exposed', 'seam', 'wall'],
    ),
    piece('B', 'Left return', rect(0, 25.5, 25.5, 88.5), ['seam', 'exposed', 'exposed', 'wall']),
    piece('C', 'Island', rect(0, 120, 76.5, 157.5), ['exposed', 'exposed', 'seating', 'exposed']),
  ];
  const done = await page.evaluate(
    (c) => (window as unknown as Window2).__ezdraftEditor.edit(c),
    changes,
  );
  expect(done.length).toBeGreaterThan(0);
}

const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name, exact: true });

async function chooseSet(page: Page, name: 'Permit set' | 'Client set') {
  await id(page, 'sheets-set-selector').click();
  await page.getByRole('menuitemradio', { name }).click();
}

test.describe('EZD-720 client set content', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-720 AC-1 AC-2 the Client set shows the countertop sheets and the Permit set never does', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS(EDITOR);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await seedBoardTops(page);
    await saved(page);

    await tab(page, 'Sheets').click();
    await expect(id(page, 'sheet-preview')).toHaveAttribute('data-sheet', 'A0.0');
    await expect(id(page, 'sheet-row-A3.0')).toBeVisible();
    await expect(id(page, 'sheet-row-A8.0')).toHaveCount(0);
    await expect(id(page, 'sheet-row-A9.0')).toHaveCount(0);

    await chooseSet(page, 'Client set');
    await expect(id(page, 'sheet-row-A8.0')).toBeVisible();
    await expect(id(page, 'sheet-row-A9.0')).toBeVisible();
    await expect(id(page, 'sheet-row-R1.0')).toBeVisible();
    await id(page, 'sheet-row-A8.0').click();
    await expect(id(page, 'sheet-preview')).toHaveAttribute('data-sheet', 'A8.0');
    const drawing = id(page, 'sheet-drawing');
    await expect(drawing).toContainText('TOP SCHEDULE');
    await expect(drawing).toContainText('A - Back wall');
    await expect(drawing).toContainText('25.1');

    await chooseSet(page, 'Permit set');
    await expect(id(page, 'sheet-row-A8.0')).toHaveCount(0);
    await expect(id(page, 'sheet-row-A9.0')).toHaveCount(0);

    // Read again from the server: the same sets.
    await openReady(page, ids.P1);
    await tab(page, 'Sheets').click();
    await expect(id(page, 'sheet-row-A8.0')).toHaveCount(0);
    await chooseSet(page, 'Client set');
    await expect(id(page, 'sheet-row-A8.0')).toBeVisible();
    await expect(id(page, 'sheet-row-A9.0')).toBeVisible();
  });
});

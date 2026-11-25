// EZD-418 (AC-EZD-418-1 "Schedule matches the pieces and exports to CSV"; S04b Controls "Top schedule | Inspector
// footer | Opens schedule: material, thickness, area, edge length"; 08 Exports "Countertop schedule | On sheets, CSV |
// Piece, material, thickness, area, edge profile, edge length"; board S04bCountertops). Desktop 1600 x 1000. Each
// test makes its own company (never tenant 1) with fixture S and its own member. The board's three tops are seeded
// through the editor hook (as app/src/editor/countertops/test-fixture.ts boardPiecesModel); hand counts:
//   A "Back wall"   141.5 × 25.5 = 3608.25 sq in → 25.1 sq ft; exposed 116"  → 9.7 lf
//   B "Left return" 25.5 × 63    = 1606.5 sq in  → 11.2 sq ft; exposed 88.5" → 7.4 lf
//   C "Island"      76.5 × 37.5  = 2868.75 sq in → 19.9 sq ft (board); exposed 228" → 19.0 lf
// Thickness 3 cm (board "Quartz · 3 cm"); no material or profile: "—". Helpers are copies of countertops-trace.spec.ts.
// No import.meta or __dirname (L-017).
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

const scheduleRows = (page: Page) =>
  id(page, 'top-schedule-row').evaluateAll((rows) =>
    rows.map((r) => Array.from(r.querySelectorAll('td')).map((td) => td.textContent ?? '')),
  );

const BOARD_ROWS = [
  ['A · Back wall', '—', '3 cm', '25.1', '—', '9.7'],
  ['B · Left return', '—', '3 cm', '11.2', '—', '7.4'],
  ['C · Island', '—', '3 cm', '19.9', '—', '19.0'],
];

test.describe('EZD-418 Top schedule', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-418-1 the schedule matches the pieces and Export CSV downloads it', async ({ page, signInAs }) => {
    const { ids: project, user } = await fixtureS([...EDITOR, 'export']);
    await signInAs(user.email);
    await openReady(page, project.P1);
    await seedBoardTops(page);
    await saved(page);

    await page.keyboard.press('k');
    await expect(id(page, 'countertops')).toBeVisible();
    await expect(id(page, 'countertop-top-schedule')).toHaveText('Top schedule');
    await id(page, 'countertop-top-schedule').click();
    await expect(id(page, 'top-schedule')).toBeVisible();
    await expect.poll(() => scheduleRows(page)).toEqual(BOARD_ROWS);

    const download = page.waitForEvent('download');
    await id(page, 'top-schedule-export').click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('Top schedule.csv');
    const stream = await file.createReadStream();
    let csv = '';
    for await (const chunk of stream) csv += String(chunk);
    expect(csv.split('\r\n')).toEqual([
      'Piece,Material,Thickness,Area (sq ft),Edge profile,Edge length (lf)',
      'A · Back wall,—,3 cm,25.1,—,9.7',
      'B · Left return,—,3 cm,11.2,—,7.4',
      'C · Island,—,3 cm,19.9,—,19.0',
      '',
    ]);

    await id(page, 'top-schedule-close').click();
    await expect(id(page, 'top-schedule')).toHaveCount(0);
  });

  test('without Export the schedule opens with no Export CSV', async ({ page, signInAs }) => {
    const { ids: project, user } = await fixtureS(EDITOR);
    await signInAs(user.email);
    await openReady(page, project.P1);
    await seedBoardTops(page);
    await saved(page);

    await page.keyboard.press('k');
    await id(page, 'countertop-top-schedule').click();
    await expect.poll(() => scheduleRows(page)).toEqual(BOARD_ROWS);
    await expect(id(page, 'top-schedule-export')).toHaveCount(0);
  });
});

// EZD-215 B1 (AC-EZD-215-1, -3, -4, -5; Q-0205; 09-calculations Q-0704, Q-0708; 07 Q-0708). Local stack, real
// sign-in (as pins.spec.ts). A bearing wall drawn through the editor's edit hook is deleted with the Delete key: the
// wall goes and one engineer note with the wall's line stays, "Engineer required". It survives a save, a reload and a
// checkpoint, and its red mark selects it in both the Existing and the Proposed view. The form refuses Save without
// the engineer name; the tick is offered once both texts are filled; a PDF letter uploads as engineer_letter; the
// tick clears the warning and the mark. Both writes leave an event_log row on the wall.
import { createWallData, type Point } from '@ezdraft/geometry';
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

type View = { x: number; y: number; ppi: number };
type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = {
  __ezdraftPlan: { handle: { setView(v: View): void; modelToScreen(p: Point): Point } };
  __ezdraftEditor: {
    objects(): Obj[];
    edit(changes: unknown[]): string[];
    checkpoint(): Promise<{ status: string; versionId?: string }>;
  };
};
type NoteAttrs = {
  wallId: string;
  action: string;
  engineerName: string;
  approvedText: string;
  fileId: string | null;
  letterOnFile: boolean;
};

const WALL = '7a0d4c55-215a-4e1b-9c33-000000000215';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const canvasRegion = (page: Page) => page.locator('[data-shell-region="canvas"]');
const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });
const viewButton = (page: Page, v: 'existing' | 'proposed') =>
  id(page, 'status-phase').locator(`button[data-value="${v}"]`);

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
  await page.evaluate(() =>
    (window as unknown as Window2).__ezdraftPlan.handle.setView({ x: -48, y: 144, ppi: 8 / 3 }),
  );
}

async function clickAt(page: Page, x: number, y: number) {
  const box = await canvasRegion(page).boundingBox();
  if (!box) throw new Error('canvas region has no box');
  const s = await page.evaluate(
    (p) => (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen(p),
    { x, y },
  );
  await page.mouse.click(box.x + s.x, box.y + s.y);
}

const objects = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects());
const notes = async (page: Page) => (await objects(page)).filter((o) => o.type === 'engineer_note');
const noteAttrs = async (page: Page) => (await notes(page))[0]?.data.attributes as NoteAttrs;

test.describe('EZD-215 bearing wall rule', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-215 B1 a deleted bearing wall leaves Engineer required until the letter is on file', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, user.membershipId, ['view_projects', 'edit_model'] as never);
    await signInAs(user.email);
    await openReady(page, ids.P1);

    // A bearing wall from (0, 0) to (120, 0) on the open floor.
    const floor = (await objects(page)).find((o) => o.type === 'floor')!.id;
    const r = createWallData({ start: { x: 0, y: 0 }, end: { x: 120, y: 0 }, level: floor });
    if (!r.ok) throw new Error(r.reason);
    const wall = { ...r.data, attributes: { ...r.data.attributes, bearing: true } };
    await page.evaluate(
      ([wid, data]) =>
        (window as unknown as Window2).__ezdraftEditor.edit([
          { id: wid, value: { type: 'wall', schemaVersion: 6, data } },
        ]),
      [WALL, wall] as const,
    );
    await saved(page);

    // AC-1: Delete deletes it and adds one note with its line.
    await clickAt(page, 30, 0);
    await expect(page.locator('[data-inspector-kind="wall"]')).toBeVisible();
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await notes(page)).length).toBe(1);
    expect((await objects(page)).some((o) => o.id === WALL)).toBe(false);
    const [note] = await notes(page);
    expect(note!.data).toMatchObject({
      geometry: { start: { x: 0, y: 0 }, end: { x: 120, y: 0 } },
      status: 'existing',
      level: floor,
      attributes: { wallId: WALL, action: 'delete', letterOnFile: false },
    });
    // The note is saved (the save label may still read from the wall's save).
    await expect
      .poll(
        async () =>
          (
            await harnessSql()<{ n: number }[]>`
              select count(*)::int as n from public.model_object
              where object_id = ${note!.id}::uuid and not deleted`
          )[0]!.n,
        { timeout: 15_000 },
      )
      .toBe(1);
    await saved(page);

    // AC-3: it survives a reload and a checkpoint, and shows in Existing and Proposed.
    await page.reload();
    await openReady(page, ids.P1);
    expect((await notes(page)).map((n) => n.id)).toEqual([note!.id]);
    const cp = await page.evaluate(() =>
      (window as unknown as Window2).__ezdraftEditor.checkpoint(),
    );
    expect(cp.versionId).toBeTruthy();
    const [version] = await harnessSql()<
      { model_json: { objects: { id: string; type: string }[] } }[]
    >`
      select model_json from public.model_version where id = ${cp.versionId!}::uuid`;
    expect(
      version!.model_json.objects.filter((o) => o.type === 'engineer_note').map((o) => o.id),
    ).toEqual([note!.id]);
    const inspector = page.locator('[data-inspector-kind="engineer_note"]');
    for (const v of ['proposed', 'existing'] as const) {
      await page.keyboard.press('Escape');
      await viewButton(page, v).click();
      await clickAt(page, 60, 0);
      await expect(inspector).toBeVisible();
      await expect(id(page, 'engineer-required')).toHaveText('Engineer required');
    }

    // AC-4: Save refuses an empty name; the tick waits for both texts; a PDF letter attaches.
    await id(page, 'engineer-approved').fill('Header 2-2x12 over 10 ft opening');
    await id(page, 'engineer-save').click();
    await expect(id(page, 'engineer-save-error')).toHaveText('Enter the engineer name.');
    await expect(id(page, 'engineer-on-file')).toBeDisabled();
    await id(page, 'engineer-name').fill('A. Engineer, PE');
    await expect(id(page, 'engineer-on-file')).toBeEnabled();
    await id(page, 'engineer-letter-input').setInputFiles({
      name: 'letter.pdf',
      mimeType: 'application/pdf',
      buffer: PDF,
    });
    await expect.poll(async () => (await noteAttrs(page)).fileId).not.toBeNull();
    const fileId = (await noteAttrs(page)).fileId!;
    const [file] = await harnessSql()<{ kind: string }[]>`
      select kind from public.source_file where id = ${fileId}::uuid`;
    expect(file!.kind).toBe('engineer_letter');
    await id(page, 'engineer-on-file').check();
    await id(page, 'engineer-save').click();
    await expect.poll(async () => (await noteAttrs(page)).letterOnFile).toBe(true);
    // A cleared note is not drawn, so it leaves the selection and its mark no longer picks.
    await expect(inspector).toHaveCount(0);
    await clickAt(page, 60, 0);
    await expect(inspector).toHaveCount(0);
    await saved(page);

    // AC-5: one row for the warning and one for the attached note, on the wall, by this member.
    await expect
      .poll(async () =>
        (
          await harnessSql()<{ action: string; actor_app_user_id: string; details: unknown }[]>`
            select action, actor_app_user_id, details from public.event_log
            where object_id = ${WALL}::uuid order by at`
        ).map((x) => [x.action, x.actor_app_user_id, x.details]),
      )
      .toEqual([
        [
          'wall.engineer_required',
          user.appUserId,
          { wallId: WALL, noteId: note!.id, fileId: null },
        ],
        ['wall.engineer_note_attached', user.appUserId, { wallId: WALL, noteId: note!.id, fileId }],
      ]);
  });
});

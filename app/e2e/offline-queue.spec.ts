// EZD-1402 (AC-EZD-1402-1 Offline acceptance test: "Holder edits offline, reconnects; all queued changes sync as
// autosaves and one checkpoint version follows, with no loss"; AC-EZD-1402-2 "a task check and a photo queued
// offline arrive after reconnect"; 04 Header card subtitle "Offline, 3 changes queued"). Untagged, so desktop. Every
// test makes its own company with fixture S. The conflict part of the Offline row (another user's change while the
// holder is offline) is EZD-1403's (vault/build/assumptions.md EZD-1402). Expected values: three walls added offline
// are counted in the subtitle, all three are saved on reconnect, exactly one new model_version follows, and they are
// there after a reload; a task check and a photo pin queued on the field outbox test page are recorded as
// offline_change rows of the member, the photo stored in media.
import { CURRENT_SCHEMA_VERSION, createWallData } from '@ezdraft/geometry';
import type { Page } from '@playwright/test';
import {
  adminDb,
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

const madePaths: string[] = [];

type Win = {
  __ezdraftEditor: {
    objects(): Array<{ id: string; type: string }>;
    edit(changes: unknown[]): string[];
  };
};

async function member(tenant: string, permissions: string[]) {
  const m = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, m.membershipId, permissions as never);
  return m;
}

async function addWall(page: Page, y: number): Promise<string> {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Win).__ezdraftEditor
      .objects()
      .find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const made = createWallData({ start: { x: 0, y }, end: { x: 120, y }, level });
  if (!made.ok) throw new Error('wall data');
  const id = crypto.randomUUID();
  const change = {
    id,
    value: {
      type: 'wall',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: { ...made.data, status: 'existing' },
    },
  };
  await page.evaluate((c) => (window as unknown as Win).__ezdraftEditor.edit([c]), change);
  return id;
}

const versions = async (projectId: string) =>
  (
    await harnessSql()<{ n: number }[]>`
      select count(*)::int as n from public.model_version where project_id = ${projectId}::uuid`
  )[0]!.n;

const savedWalls = async (projectId: string, ids: string[]) =>
  (
    await harnessSql()<{ n: number }[]>`
      select count(*)::int as n from public.model_object
      where project_id = ${projectId}::uuid and object_id = any (${ids}::uuid[]) and not deleted`
  )[0]!.n;

test.describe('EZD-1402 offline change queue', () => {
  test.afterAll(async () => {
    try {
      if (madePaths.length > 0) await adminDb().storage.from('media').remove(madePaths);
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-1402-1 edits made offline sync on reconnect, then one checkpoint, with no loss', async ({
    page,
    signInAs,
    network,
  }) => {
    test.setTimeout(120_000);
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const a = await member(tenant, ['view_projects', 'edit_model']);
    await signInAs(a.email);
    await page.goto(`/projects/${ids.P1}`);
    await expect(page.getByTestId('editor-state')).toHaveAttribute('data-editor-state', 'ready');
    const before = await versions(ids.P1);

    await network.set(page, 'off');
    const walls = [await addWall(page, 24), await addWall(page, 48), await addWall(page, 72)];
    await expect(page.getByTestId('save-state')).toHaveText('Offline, 3 changes queued');
    expect(await savedWalls(ids.P1, walls)).toBe(0);

    await network.set(page, 'on');
    await expect.poll(() => savedWalls(ids.P1, walls), { timeout: 20_000 }).toBe(3);
    await expect.poll(() => versions(ids.P1), { timeout: 20_000 }).toBe(before + 1);
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-status', 'saved');
    // One checkpoint only: still one more than before a moment later.
    await page.waitForTimeout(3000);
    expect(await versions(ids.P1)).toBe(before + 1);

    await page.reload();
    await expect(page.getByTestId('editor-state')).toHaveAttribute('data-editor-state', 'ready');
    const ids3 = await page.evaluate(() =>
      (window as unknown as Win).__ezdraftEditor.objects().map((o) => o.id),
    );
    for (const w of walls) expect(ids3).toContain(w);
  });

  test('AC-EZD-1402-2 a task check and a photo queued offline arrive after reconnect', async ({
    page,
    signInAs,
    network,
  }) => {
    test.setTimeout(120_000);
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const crew = await member(tenant, ['view_projects', 'check_off_tasks', 'photo_notes']);
    const [task] = await harnessSql()<{ id: string }[]>`
      insert into public.field_task (tenant_id, project_id, room, phase, phase_position, position, text_en, status)
      values (${tenant}::uuid, ${ids.P1}::uuid, 'Kitchen', 'Demo', 0, 0, 'Remove upper cabinets', 'published')
      returning id`;
    await signInAs(crew.email);
    await page.goto(`/dev/field-outbox/${ids.P1}`);
    await expect(page.getByTestId('field-bench')).toHaveAttribute('data-ready', 'true');

    await network.set(page, 'off');
    await page.getByTestId('field-bench-task').fill(task!.id);
    await page.getByTestId('field-bench-check').click();
    await page.getByTestId('field-bench-photo').setInputFiles({
      name: 'pin.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.alloc(2048, 0xff),
    });
    await page.getByTestId('field-bench-pin').click();
    const items = page.getByTestId('field-bench-actions').locator('li');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toHaveAttribute('data-kind', 'task_check');
    await expect(items.nth(1)).toHaveAttribute('data-kind', 'photo_pin');
    await expect(page.getByTestId('field-bench-readout')).toHaveAttribute('data-count', '2');
    const photoId = await items.nth(1).getAttribute('data-id');
    madePaths.push(`${tenant}/${ids.P1}/field-photos/${photoId}.jpg`);

    await network.set(page, 'on');
    await expect(items).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByTestId('field-bench-readout')).toHaveAttribute('data-count', '0');

    const rows = await harnessSql()<
      { kind: string; app_user_id: string; ops: Record<string, unknown>; photo_path: string | null }[]
    >`select kind, app_user_id, ops, photo_path from public.offline_change
      where project_id = ${ids.P1}::uuid order by queued_at, id`;
    expect(rows.map((r) => r.kind)).toEqual(['task_check', 'photo_pin']);
    expect(rows.every((r) => r.app_user_id === crew.appUserId)).toBe(true);
    expect(rows[0]!.ops).toEqual({ taskId: task!.id, done: true });
    expect(rows[1]!.photo_path).toBe(`${tenant}/${ids.P1}/field-photos/${photoId}.jpg`);
    const [stored] = await harnessSql()<{ size: string; mimetype: string }[]>`
      select metadata ->> 'size' as size, metadata ->> 'mimetype' as mimetype
      from storage.objects where bucket_id = 'media' and name = ${rows[1]!.photo_path}`;
    expect(stored).toEqual({ size: '2048', mimetype: 'image/jpeg' });
  });
});

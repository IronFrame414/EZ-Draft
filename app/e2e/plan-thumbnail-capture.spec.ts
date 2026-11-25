// EZD-224b T-B1 to T-B4 (vault/plans/EZD-224b.md section 4; AC-EZD-224-1, -3, -5). Untagged, so desktop 1600 x 1000.
// Run with `pnpm db:up && pnpm build && pnpm --filter @ezdraft/app exec playwright test e2e/plan-thumbnail-capture.spec.ts
// --project=desktop`. Every test makes its own company (never tenant 1), member and context. The checkpoint is made
// through `__ezdraftEditor.checkpoint()`; the canvas is read through `__ezdraftPlan` (region px + the canvas region's
// bounding box = page px). Expected values: the plan's section 4 rows (Q-0664, Q-0667, 09m Thumbnail rows, 11 rule 12).
// Storage objects the tests make are removed in afterAll before cleanup (L-051). No import.meta or __dirname (L-017).
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
import { BENCHMARK_EDITOR_READY_TIMEOUT_MS } from '../test-harness/e2e/benchmark-open';
import { appOriginHeaders } from '../test-harness/e2e/same-origin';
import { seedFixtureS } from '../test-harness/projects-fixture';

const EDITOR = ['view_projects', 'edit_model'];
const madePaths: string[] = [];

type View = { x: number; y: number; ppi: number };
type Pt = { x: number; y: number };
type Crop = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
};
type Outcome =
  | { status: 'saved'; versionId: string; quality: number; bytes: number; crop: Crop }
  | { status: 'empty' | 'too_large'; versionId: string }
  | { status: 'failed'; versionId?: string; code: string };
type Win = {
  __ezdraftPlan: {
    handle: { getView(): View; modelToScreen(p: Pt): Pt };
    stats(): { frames: number; bufferUploads: number; contexts: number; glyphs: number };
  };
  __ezdraftEditor: {
    objects(): Array<{ id: string; type: string }>;
    edit(changes: unknown[]): string[];
    checkpoint(): Promise<Outcome>;
  };
};

const editorState = (page: Page) => page.getByTestId('editor-state');
const planCanvas = (page: Page) => page.getByTestId('plan-canvas');
const canvasRegion = (page: Page) => page.locator('[data-shell-region="canvas"]');

// `editorReadyTimeout` is left out for small projects (Playwright's default 5 s). Only the benchmark project
// passes one (EZD-1989): the allowance EZD-1971 settled for its first open on the CI runner.
async function openReady(page: Page, projectId: string, editorReadyTimeout?: number) {
  await page.goto(`/projects/${projectId}`);
  await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready', {
    timeout: editorReadyTimeout,
  });
  await expect(planCanvas(page)).toHaveAttribute('data-plan-state', 'ready');
}

const stat = (page: Page, name: 'frames' | 'bufferUploads' | 'contexts' | 'glyphs') =>
  page.evaluate((n) => (window as unknown as Win).__ezdraftPlan.stats()[n], name);
const getView = (page: Page) =>
  page.evaluate(() => (window as unknown as Win).__ezdraftPlan.handle.getView());
const checkpoint = (page: Page) =>
  page.evaluate(() => (window as unknown as Win).__ezdraftEditor.checkpoint());

// Idle wait: two equal `frames` reads 500 ms apart (copy of plan-canvas.spec.ts).
async function waitIdle(page: Page) {
  await expect
    .poll(
      async () => {
        const a = await stat(page, 'frames');
        await page.waitForTimeout(500);
        return (await stat(page, 'frames')) === a;
      },
      { intervals: [100], timeout: 10_000 },
    )
    .toBe(true);
}

function watchThumbnailRequests(page: Page) {
  const seen: string[] = [];
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname;
    if (r.method() === 'POST' && path.includes('/thumbnail')) seen.push(path);
  });
  return seen;
}

async function addWall(page: Page, start: Pt, end: Pt) {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Win).__ezdraftEditor
      .objects()
      .find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const made = createWallData({ start, end, level });
  if (!made.ok) throw new Error('wall data');
  const change = {
    id: crypto.randomUUID(),
    value: {
      type: 'wall',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: { ...made.data, status: 'existing' },
    },
  };
  await page.evaluate((c) => (window as unknown as Win).__ezdraftEditor.edit([c]), change);
}

async function fixtureS() {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const m = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, m.membershipId, EDITOR as never);
  return { tenant, ids, user: m };
}

test.describe('EZD-224b plan thumbnail capture', () => {
  test.afterAll(async () => {
    try {
      if (madePaths.length > 0) await adminDb().storage.from('media').remove(madePaths);
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-224b T-B1 a benchmark checkpoint saves one 440 x 256 WebP with one extra frame', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(120_000);
    const tenant = await createTenant();
    const member = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, member.membershipId, [
      'view_projects',
      'edit_model',
      'settings_system_status',
    ] as never);
    await signInAs(member.email);
    const made = await page.request.post('/api/benchmark/project', { headers: appOriginHeaders() });
    expect(made.status()).toBe(201);
    const id = ((await made.json()) as { project: { id: string } }).project.id;

    await openReady(page, id, BENCHMARK_EDITOR_READY_TIMEOUT_MS);
    await expect
      .poll(() => stat(page, 'glyphs'), { intervals: [100], timeout: 15_000 })
      .toBeGreaterThan(0);
    await waitIdle(page);

    const requests = watchThumbnailRequests(page);
    const framesBefore = await stat(page, 'frames');
    const uploadsBefore = await stat(page, 'bufferUploads');
    const viewBefore = await getView(page);
    const box = await canvasRegion(page).boundingBox();
    const dpr = await page.evaluate(() => window.devicePixelRatio);

    const out = await checkpoint(page);
    expect(out.status).toBe('saved');
    if (out.status !== 'saved') return;
    madePaths.push(`${tenant}/${id}/thumb/${out.versionId}.webp`);

    expect(out.bytes).toBeGreaterThanOrEqual(1);
    expect(out.bytes).toBeLessThanOrEqual(40959);
    expect([80, 70, 60, 50, 40]).toContain(out.quality);
    expect(await stat(page, 'frames')).toBe(framesBefore + 1);
    expect(await stat(page, 'bufferUploads')).toBe(uploadsBefore);
    expect(await getView(page)).toEqual(viewBefore);
    expect(await stat(page, 'contexts')).toBe(1);
    expect(out.crop.sw).toBeCloseTo(box!.width * dpr, 3);
    expect(out.crop.sh).toBeCloseTo(box!.height * dpr, 3);
    expect(requests.filter((p) => p.endsWith('/thumbnail'))).toHaveLength(1);
    expect(requests.filter((p) => p.endsWith('/thumbnail/complete'))).toHaveLength(1);

    const path = `${tenant}/${id}/thumb/${out.versionId}.webp`;
    const sql = harnessSql();
    const [ver] = await sql<{ preview_path: string | null }[]>`
      select preview_path from public.model_version where id = ${out.versionId}::uuid`;
    expect(ver?.preview_path).toBe(path);
    const [proj] = await sql<{ thumbnail_path: string | null }[]>`
      select thumbnail_path from public.project where id = ${id}::uuid`;
    expect(proj?.thumbnail_path).toBe(path);
    const [obj] = await sql<{ mimetype: string; size: number }[]>`
      select metadata->>'mimetype' as mimetype, (metadata->>'size')::int as size
      from storage.objects where bucket_id = 'media' and name = ${path}`;
    expect(obj?.mimetype).toBe('image/webp');
    expect(obj?.size).toBe(out.bytes);
    await page.waitForLoadState('networkidle');
  });

  test('EZD-224b T-B2 20 autosaves write no thumbnail; a checkpoint does', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(150_000);
    const { tenant, ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const requests = watchThumbnailRequests(page);
    let saves = 0;
    page.on('response', (r) => {
      const u = new URL(r.url());
      if (
        r.request().method() === 'POST' &&
        u.pathname === `/api/projects/${ids.P1}/objects` &&
        r.status() === 200
      )
        saves += 1;
    });
    const sql = harnessSql();
    const count = async () =>
      (
        await sql<
          { n: number }[]
        >`select count(*)::int as n from public.model_version where project_id = ${ids.P1}::uuid`
      )[0]!.n;
    const versionsBefore = await count();

    for (let n = 1; n <= 20; n++) {
      await addWall(page, { x: 0, y: 24 * n }, { x: 120, y: 24 * n });
      await expect.poll(() => saves, { intervals: [100], timeout: 15_000 }).toBe(n);
    }
    expect(saves).toBe(20);
    expect(requests).toHaveLength(0);
    expect(await count()).toBe(versionsBefore);
    const [proj] = await sql<{ thumbnail_path: string | null }[]>`
      select thumbnail_path from public.project where id = ${ids.P1}::uuid`;
    expect(proj?.thumbnail_path).toBeNull();
    const like = `${tenant}/${ids.P1}/thumb/%`;
    const [none] = await sql<{ n: number }[]>`
      select count(*)::int as n from storage.objects where bucket_id = 'media' and name like ${like}`;
    expect(none?.n).toBe(0);

    // Control: the counter does see thumbnail requests (start and complete).
    const out = await checkpoint(page);
    expect(out.status).toBe('saved');
    if (out.status === 'saved') madePaths.push(`${tenant}/${ids.P1}/thumb/${out.versionId}.webp`);
    expect(requests).toHaveLength(2);
    await page.waitForLoadState('networkidle');
  });

  test('EZD-224b T-B3 the card shows the capture, with the band colour and the wall', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(120_000);
    const { tenant, ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    let saves = 0;
    page.on('response', (r) => {
      const u = new URL(r.url());
      if (
        r.request().method() === 'POST' &&
        u.pathname === `/api/projects/${ids.P1}/objects` &&
        r.status() === 200
      )
        saves += 1;
    });
    await addWall(page, { x: 0, y: 0 }, { x: 120, y: 0 });
    await expect.poll(() => saves, { intervals: [100], timeout: 15_000 }).toBe(1);
    await waitIdle(page);

    const p = await page.evaluate(() =>
      (window as unknown as Win).__ezdraftPlan.handle.modelToScreen({ x: 60, y: -2.25 }),
    );
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    const out = await checkpoint(page);
    expect(out.status).toBe('saved');
    if (out.status !== 'saved') return;
    const path = `${tenant}/${ids.P1}/thumb/${out.versionId}.webp`;
    madePaths.push(path);
    const crop = out.crop;

    await page.goto('/');
    const card = page.locator(`[data-testid="project-card"][data-project-id="${ids.P1}"]`);
    const img = card.getByTestId('project-card-thumb-img');
    await expect(img).toBeVisible();
    await expect
      .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 15_000 })
      .toBe(440);
    expect(await img.evaluate((el) => (el as HTMLImageElement).complete)).toBe(true);
    expect(await img.evaluate((el) => (el as HTMLImageElement).naturalHeight)).toBe(256);

    const dl = await adminDb().storage.from('media').download(path);
    expect(dl.error).toBeNull();
    const bytes = Array.from(new Uint8Array(await dl.data!.arrayBuffer()));

    expect(Math.max(crop.dx, crop.dy)).toBeGreaterThanOrEqual(2);
    const band: Pt =
      crop.dy >= crop.dx
        ? { x: 220, y: Math.floor(crop.dy / 2) }
        : { x: Math.floor(crop.dx / 2), y: 128 };
    const wallPt: Pt = {
      x: Math.floor(crop.dx + (p.x * dpr * crop.dw) / crop.sw),
      y: Math.floor(crop.dy + (p.y * dpr * crop.dh) / crop.sh),
    };
    const px = await page.evaluate(
      async ({ bytes, points }) => {
        const bmp = await createImageBitmap(
          new Blob([new Uint8Array(bytes)], { type: 'image/webp' }),
          {
            colorSpaceConversion: 'none',
          },
        );
        const c = new OffscreenCanvas(440, 256);
        const ctx = c.getContext('2d')!;
        ctx.drawImage(bmp, 0, 0);
        return points.map((q) => Array.from(ctx.getImageData(q.x, q.y, 1, 1).data.slice(0, 3)));
      },
      { bytes, points: [band, wallPt] },
    );
    const clear = [246, 247, 249];
    px[0]!.forEach((v, i) => expect(Math.abs(v - clear[i]!)).toBeLessThanOrEqual(8));
    expect(px[1]!.some((v, i) => Math.abs(v - clear[i]!) > 40)).toBe(true);
    await page.waitForLoadState('networkidle');
  });

  test('EZD-224b T-B4 an empty model saves no thumbnail and the card keeps its empty slot', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(120_000);
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await waitIdle(page);
    const requests = watchThumbnailRequests(page);
    const framesBefore = await stat(page, 'frames');

    const out = await checkpoint(page);
    expect(out.status).toBe('empty');
    expect(typeof (out as { versionId?: unknown }).versionId).toBe('string');
    expect(requests).toHaveLength(0);
    expect(await stat(page, 'frames')).toBe(framesBefore);

    const sql = harnessSql();
    const [ver] = await sql<{ preview_path: string | null }[]>`
      select preview_path from public.model_version where id = ${(out as { versionId: string }).versionId}::uuid`;
    expect(ver?.preview_path).toBeNull();
    const [proj] = await sql<{ thumbnail_path: string | null }[]>`
      select thumbnail_path from public.project where id = ${ids.P1}::uuid`;
    expect(proj?.thumbnail_path).toBeNull();

    await page.goto('/');
    const card = page.locator(`[data-testid="project-card"][data-project-id="${ids.P1}"]`);
    await expect(card.getByTestId('project-card-thumb')).toBeVisible();
    await expect(card.getByTestId('project-card-thumb-img')).toHaveCount(0);
    await page.waitForLoadState('networkidle');
  });
});

// EZD-5603a B1-B6 (vault/plans/EZD-5603a.md section 4; AC-EZD-5603-1, -2, -3, -4, -5, -10, -12, -14). B1-B5 are
// untagged (desktop 1600 x 1000); B6 is @ipad. Every test makes its own company (never tenant 1) with fixture S
// (P1 "bravo" starts with the floor "Floor 1") and its own member. B1, B3 and B5 use only the built-in key-check
// and assistant recordings; B4 and B6 answer through page.route, so no spec writes AI_STUB_DIR. The wall is read
// and picked through the `__ezdraftPlan`, `__ezdraftEditor` and `__ezdraftSelection` test hooks. No import.meta
// or __dirname (lesson L-017). The key canary is only ever sent, never compared (lesson L-018).
import { CURRENT_SCHEMA_VERSION, createWallData, type Point } from '@ezdraft/geometry';
import type { Locator, Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { formatUsd } from '../src/lib/assistant/cost';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  expectTouchTargets,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { appOriginHeaders } from '../test-harness/e2e/same-origin';
import { seedFixtureS } from '../test-harness/projects-fixture';

const EDITOR = ['view_projects', 'edit_model'];
const VIEWER = ['view_projects'];
const ASSISTANT_ROUTE = '**/api/projects/*/assistant';
const OUT_OF_CREDIT =
  'Your Anthropic account is out of credit. Nothing on the drawing changed. Add credit with Anthropic, then send again.';

async function member(tenant: string, permissions: string[]) {
  const m = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, m.membershipId, permissions as never);
  return m;
}

async function fixtureS(permissions: string[] = EDITOR) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  return { tenant, ids, user: await member(tenant, permissions) };
}

type View = { x: number; y: number; ppi: number };
type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = {
  __ezdraftPlan: {
    handle: { setView(v: View): void; modelToScreen(p: Point): Point };
  };
  __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] };
  __ezdraftSelection: { ids(): string[] };
};

const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const editorState = (page: Page) => id(page, 'editor-state');
const canvasRegion = (page: Page) => page.locator('[data-shell-region="canvas"]');
const inspector = (page: Page) => page.locator('[data-shell-region="inspector"]');
const tool = (page: Page, which: string) => page.locator(`[data-rail-tool="${which}"]`);

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}

// view: model (0,0) at region px (128, 384); 8/3 px per inch.
async function view(page: Page) {
  await page.evaluate(() =>
    (window as unknown as Window2).__ezdraftPlan.handle.setView({ x: -48, y: 144, ppi: 8 / 3 }),
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen({ x: 0, y: 0 }),
      ),
    )
    .toEqual({ x: 128, y: 384 });
}

async function at(page: Page, x: number, y: number): Promise<Point> {
  const box = await canvasRegion(page).boundingBox();
  if (!box) throw new Error('canvas region has no box');
  const s = await page.evaluate(
    (p) => (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen(p),
    { x, y },
  );
  return { x: box.x + s.x, y: box.y + s.y };
}

const objects = (page: Page): Promise<Obj[]> =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects());
const selectedIds = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftSelection.ids());

// addGap: the GAP walls (0,0)->(144,0)->(144,120)->(0,120)->(0,0.5) through the editor hook (09j Closure row 2).
async function addGap(page: Page) {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const pts: Point[] = [
    { x: 0, y: 0 },
    { x: 144, y: 0 },
    { x: 144, y: 120 },
    { x: 0, y: 120 },
    { x: 0, y: 0.5 },
  ];
  const changes = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const made = createWallData({
      start: pts[i]!,
      end: pts[i + 1]!,
      level,
      thicknessSide: 'right',
    });
    if (!made.ok) throw new Error('wall data');
    changes.push({
      id: crypto.randomUUID(),
      value: { type: 'wall', schemaVersion: CURRENT_SCHEMA_VERSION, data: made.data },
    });
  }
  await page.evaluate((c) => (window as unknown as Window2).__ezdraftEditor.edit(c), changes);
}

const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

// The id of the wall (0,0)->(144,0), the one the click at model (72, 0) picks.
async function topWallId(page: Page): Promise<string> {
  const wall = (await objects(page)).find((o) => {
    if (o.type !== 'wall') return false;
    const g = o.data.geometry as { start: Point; end: Point };
    return g.start.x === 0 && g.start.y === 0 && g.end.x === 144 && g.end.y === 0;
  });
  if (!wall) throw new Error('no top wall');
  return wall.id;
}

// Key through the built-in key-check recording (EZD-5601).
async function addKey(page: Page) {
  const response = await page.request.post('/api/profile/ai-key', {
    headers: appOriginHeaders(),
    data: { key: 'sk-ant-api03-EZD5603A' + randomUUID().replaceAll('-', '') },
  });
  expect(response.ok()).toBe(true);
}

// An editor with the gap drawn and saved, the view fixed and (optionally) a key on the account.
async function ready(
  page: Page,
  signInAs: (email: string) => Promise<unknown>,
  o: { key: boolean; permissions?: string[] },
) {
  const { ids, user } = await fixtureS(o.permissions);
  await signInAs(user.email);
  if (o.key) await addKey(page);
  await openReady(page, ids.P1);
  await addGap(page);
  await saved(page);
  await view(page);
  return { ids, user };
}

async function pickWall(page: Page) {
  await tool(page, 'select').click();
  const p = await at(page, 72, 0);
  await page.mouse.click(p.x, p.y);
  await expect.poll(() => selectedIds(page)).toEqual([await topWallId(page)]);
}

test.describe('EZD-5603a assistant panel', () => {
  // On WebKit a service-worker-controlled page is not routed by page.route (precedent: disabled-tool.spec.ts).
  test.use({ serviceWorkers: 'block' });

  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-5603a B1 the rail button opens the panel in the inspector place; a selection keeps it open; × closes it', async ({
    page,
    signInAs,
  }) => {
    await ready(page, signInAs, { key: true });
    const recorded = await inspector(page).getAttribute('aria-label');
    expect(recorded).not.toBeNull();
    await expect(tool(page, 'assistant')).toHaveAttribute('aria-pressed', 'false');
    await tool(page, 'assistant').click();
    await expect(inspector(page)).toHaveAttribute('aria-label', 'Assistant');
    await expect(tool(page, 'assistant')).toHaveAttribute('aria-pressed', 'true');
    const panel = id(page, 'assistant-panel');
    await expect(panel).toContainText('Assistant');
    await expect(panel).toContainText('Plan · runs on your Anthropic key');
    await expect(id(page, 'assistant-prompt')).toHaveAttribute(
      'placeholder',
      'Ask for a change to this drawing',
    );
    await pickWall(page);
    await expect(inspector(page)).toHaveAttribute('aria-label', 'Assistant');
    await expect(panel).toBeVisible();
    expect(await selectedIds(page)).toEqual([await topWallId(page)]);
    await id(page, 'assistant-close').click();
    await expect(inspector(page)).toHaveAttribute('aria-label', recorded as string);
    await expect(tool(page, 'assistant')).toHaveAttribute('aria-pressed', 'false');
  });

  test('EZD-5603a B2 a view-only member has no Assistant button', async ({ page, signInAs }) => {
    const { ids, user } = await fixtureS(VIEWER);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await expect(tool(page, 'select')).toHaveCount(1);
    await expect(tool(page, 'assistant')).toHaveCount(0);
  });

  test('EZD-5603a B3 a prompt through the real route: Opus, the wall in selectedIds, the cost line, the box emptied', async ({
    page,
    signInAs,
  }) => {
    await ready(page, signInAs, { key: true });
    await tool(page, 'assistant').click();
    await pickWall(page);
    const wallId = await topWallId(page);
    await id(page, 'assistant-model').click();
    await id(page, 'assistant-model-opus').click();
    await id(page, 'assistant-prompt').fill('add a door to this wall');
    const requested = page.waitForRequest((r) => /\/api\/projects\/[^/]+\/assistant$/.test(r.url()));
    const answered = page.waitForResponse((r) => /\/api\/projects\/[^/]+\/assistant$/.test(r.url()));
    await id(page, 'assistant-send').click();
    const request = await requested;
    const response = await answered;
    const post = request.postData() ?? '';
    expect(post).toContain('"model":"opus"');
    const selected = /"selectedIds":\[([^\]]*)\]/.exec(post);
    expect(selected?.[1]).toContain(`"${wallId}"`);
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { costMicroUsd: number };
    await expect(id(page, 'assistant-cost')).toHaveText(
      `This prompt: about ${formatUsd(body.costMicroUsd)} · This session: ${formatUsd(body.costMicroUsd)}`,
    );
    await expect(id(page, 'assistant-prompt')).toHaveValue('');
    await expect(id(page, 'assistant-model')).toHaveText('Opus 5.5');
  });

  test('EZD-5603a B4 out of credit: the approved line, the prompt kept, My profile over the editor, the key read again on close', async ({
    page,
    signInAs,
  }) => {
    await ready(page, signInAs, { key: true });
    await page.route(ASSISTANT_ROUTE, (r) =>
      r.fulfill({
        status: 400,
        json: { error: { code: 'assistant_out_of_credit', message_key: 'error.assistant_out_of_credit' } },
      }),
    );
    await tool(page, 'assistant').click();
    const before = (await objects(page)).length;
    await id(page, 'assistant-prompt').fill('add a door to this wall');
    await id(page, 'assistant-send').click();
    await expect(id(page, 'assistant-error')).toContainText(OUT_OF_CREDIT);
    await expect(id(page, 'assistant-open-profile')).toBeVisible();
    await expect(id(page, 'assistant-prompt')).toHaveValue('add a door to this wall');
    expect((await objects(page)).length).toBe(before);
    await id(page, 'assistant-open-profile').click();
    await expect(id(page, 'profile-ai-section')).toBeVisible();
    const reread = page.waitForRequest(
      (r) => r.method() === 'GET' && new URL(r.url()).pathname === '/api/profile',
    );
    await id(page, 'my-profile-close').click();
    await reread;
    await expect(id(page, 'my-profile-dialog')).toHaveCount(0);
    await expect(id(page, 'assistant-prompt')).toHaveValue('add a door to this wall');
  });

  test('EZD-5603a B5 no key: the block, the disabled prompt area, a key added in My profile enables it', async ({
    page,
    signInAs,
  }) => {
    await ready(page, signInAs, { key: false });
    await tool(page, 'assistant').click();
    await expect(id(page, 'assistant-no-key')).toBeVisible();
    await expect(id(page, 'assistant-no-key')).toContainText(
      'Add your Anthropic API key to use the assistant.',
    );
    await expect(id(page, 'assistant-prompt')).toBeDisabled();
    await expect(id(page, 'assistant-model')).toBeDisabled();
    await expect(id(page, 'assistant-send')).toBeDisabled();
    await expect(tool(page, 'wall')).toBeEnabled();
    await id(page, 'assistant-open-profile').click();
    await expect(id(page, 'profile-ai-section')).toBeVisible();
    await id(page, 'profile-ai-key-input').fill(
      'sk-ant-api03-EZD5603A' + randomUUID().replaceAll('-', ''),
    );
    await id(page, 'profile-ai-key-add').click();
    await expect(id(page, 'profile-ai-key-saved')).toBeVisible();
    await id(page, 'my-profile-close').click();
    await expect(id(page, 'assistant-prompt')).toBeEnabled();
    await expect(id(page, 'assistant-no-key')).toHaveCount(0);
  });

  test(
    'EZD-5603a B6 touch targets: the panel with its list open, No key, and after an out-of-credit answer',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      await ready(page, signInAs, { key: false });
      const aside = inspector(page);

      await tool(page, 'assistant').click();
      await expect(id(page, 'assistant-no-key')).toBeVisible();
      expect(await expectTouchTargets(page, aside)).toBeGreaterThanOrEqual(4);

      await addKey(page);
      await id(page, 'assistant-close').click();
      await tool(page, 'assistant').click();
      await expect(id(page, 'assistant-prompt')).toBeEnabled();
      await id(page, 'assistant-model').click();
      await expect(id(page, 'assistant-model-list')).toBeVisible();
      expect(await expectTouchTargets(page, aside)).toBeGreaterThanOrEqual(5);
      await id(page, 'assistant-model-sonnet').click();
      await expect(id(page, 'assistant-model-list')).toHaveCount(0);

      await page.route(ASSISTANT_ROUTE, (r) =>
        r.fulfill({
          status: 400,
          json: {
            error: { code: 'assistant_out_of_credit', message_key: 'error.assistant_out_of_credit' },
          },
        }),
      );
      await id(page, 'assistant-prompt').fill('add a door to this wall');
      await id(page, 'assistant-send').click();
      await expect(id(page, 'assistant-error')).toContainText(OUT_OF_CREDIT);
      expect(await expectTouchTargets(page, aside)).toBeGreaterThanOrEqual(5);
    },
  );
});

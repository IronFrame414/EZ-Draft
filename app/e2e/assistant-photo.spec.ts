// EZD-5603b B1-B6 (vault/plans/EZD-5603b.md section 4; AC-EZD-5603-6, -7, -8, -10, -12). B1-B4 and B6 are untagged
// (desktop); B5 is @ipad. The setup is P5603a's (e2e/assistant-panel.spec.ts): every test makes its own company with
// fixture S and its own member, a key through the built-in key-check recording, the gap drawn. B1-B3 and B6 use
// the built-in assistant recording (`text_only`); B4 answers 429 through page.route; no spec writes AI_STUB_DIR.
// Images are made in memory with sharp; only the HEIC fixture is a committed file (Q-0661 (b)). No import.meta or
// __dirname (lesson L-017). The key canary is only ever sent, never compared (lesson L-018).
import { CURRENT_SCHEMA_VERSION, createWallData, type Point } from '@ezdraft/geometry';
import type { Locator, Page, Request } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
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
const ASSISTANT_ROUTE = '**/api/projects/*/assistant';
const A4 = "EZ Draft can't use that file. Attach a JPG, PNG, HEIC or WebP photo.";
const A5 = 'That photo is over 20 MB. Attach a smaller one.';
const UNREADABLE = "EZ Draft couldn't read that photo. Attach another one.";
const HEIC = 'e2e/fixtures/assistant/photo.heic';

async function fixtureS() {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, EDITOR as never);
  return { tenant, ids, user };
}

type View = { x: number; y: number; ppi: number };
type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = {
  __ezdraftPlan: { handle: { setView(v: View): void; modelToScreen(p: Point): Point } };
  __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] };
};

const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const inspector = (page: Page) => page.locator('[data-shell-region="inspector"]');
const tool = (page: Page, which: string) => page.locator(`[data-rail-tool="${which}"]`);

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}

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
    const made = createWallData({ start: pts[i]!, end: pts[i + 1]!, level, thicknessSide: 'right' });
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

async function addKey(page: Page) {
  const response = await page.request.post('/api/profile/ai-key', {
    headers: appOriginHeaders(),
    data: { key: 'sk-ant-api03-EZD5603B' + randomUUID().replaceAll('-', '') },
  });
  expect(response.ok()).toBe(true);
}

// An editor with the gap drawn and saved, a key on the account and the Assistant panel open.
async function ready(page: Page, signInAs: (email: string) => Promise<unknown>) {
  const { ids, user } = await fixtureS();
  await signInAs(user.email);
  await addKey(page);
  await openReady(page, ids.P1);
  await addGap(page);
  await saved(page);
  await view(page);
  await tool(page, 'assistant').click();
  await expect(id(page, 'assistant-prompt')).toBeEnabled();
  // The key is present only when the Photo control is enabled (a pick while the key loads is a no-op).
  await expect(id(page, 'assistant-photo')).toBeEnabled();
}

const jpeg = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 120, g: 90, b: 60 } } })
    .jpeg()
    .toBuffer();

async function pick(page: Page, name: string, mimeType: string, buffer: Buffer) {
  await id(page, 'assistant-photo-input').setInputFiles({ name, mimeType, buffer });
}
async function attached(page: Page) {
  await expect(id(page, 'assistant-photo-thumb')).toBeVisible({ timeout: 30_000 });
  await expect(id(page, 'assistant-photo-preparing')).toHaveCount(0);
}

// The bytes of the `photo` part of a multipart request, or null when there is none.
function photoPart(request: Request): Buffer | null {
  const body = request.postDataBuffer();
  const type = request.headers()['content-type'] ?? '';
  const boundary = /boundary=(.+)$/.exec(type)?.[1];
  if (!body || !boundary) return null;
  const at = body.indexOf('name="photo"');
  if (at < 0) return null;
  const start = body.indexOf('\r\n\r\n', at) + 4;
  const end = body.lastIndexOf(`\r\n--${boundary}`);
  return body.subarray(start, end);
}
const isJpeg = (b: Buffer | null) => b !== null && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

const sendPrompt = async (page: Page, prompt: string) => {
  await id(page, 'assistant-prompt').fill(prompt);
  const requested = page.waitForRequest(ASSISTANT_ROUTE);
  await id(page, 'assistant-send').click();
  return requested;
};

test.describe('EZD-5603b assistant photo', () => {
  // On WebKit a service-worker-controlled page is not routed by page.route (precedent: disabled-tool.spec.ts).
  test.use({ serviceWorkers: 'block' });

  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-5603b B1 a 4032 x 3024 photo is shrunk in the browser, sent with one prompt and not with the next', async ({
    page,
    signInAs,
  }) => {
    await ready(page, signInAs);
    await pick(page, 'kitchen.jpg', 'image/jpeg', await jpeg(4032, 3024));
    await attached(page);
    await expect(id(page, 'assistant-photo-name')).toHaveText('kitchen.jpg');
    const first = await sendPrompt(page, 'what is in this photo');
    const part = photoPart(await first);
    expect(isJpeg(part)).toBe(true);
    const meta = await sharp(part!).metadata();
    expect([meta.width, meta.height]).toEqual([1568, 1176]);
    expect(part!.length).toBeLessThanOrEqual(3_500_000);
    const response = await (await first).response();
    expect(response?.status()).toBe(200);
    await expect(id(page, 'assistant-bubble-photo')).toBeVisible();
    await expect(id(page, 'assistant-photo-thumb')).toHaveCount(0);
    const second = await sendPrompt(page, 'and now without it');
    expect((await second).postData() ?? '').not.toContain('name="photo"');
  });

  test('EZD-5603b B2 a HEIC photo is decoded by heic-to and sent as a JPEG within 1,568 pixels', async ({
    page,
    signInAs,
  }) => {
    await ready(page, signInAs);
    await id(page, 'assistant-photo-input').setInputFiles(HEIC);
    await attached(page);
    const part = photoPart(await sendPrompt(page, 'what is in this photo'));
    expect(isJpeg(part)).toBe(true);
    const meta = await sharp(part!).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1568);
  });

  test('EZD-5603b B3 a wrong type, a file over 20 MB and an unreadable photo are refused with nothing sent', async ({
    page,
    signInAs,
  }) => {
    await ready(page, signInAs);
    let sent = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST' && /\/api\/projects\/[^/]+\/assistant$/.test(r.url())) sent += 1;
    });
    const gif = Buffer.alloc(20);
    gif.write('GIF89a');
    await pick(page, 'a.gif', 'image/gif', gif);
    await expect(id(page, 'assistant-photo-error')).toContainText(A4);

    const big = Buffer.alloc(20_000_001);
    big.set([0xff, 0xd8, 0xff, 0xe0]);
    await pick(page, 'big.jpg', 'image/jpeg', big);
    await expect(id(page, 'assistant-photo-error')).toContainText(A5);

    const bad = Buffer.alloc(104, 0x07);
    bad.set([0xff, 0xd8, 0xff, 0xe0]);
    await pick(page, 'bad.jpg', 'image/jpeg', bad);
    await expect(id(page, 'assistant-photo-error')).toContainText(UNREADABLE, { timeout: 30_000 });
    expect(sent).toBe(0);
  });

  test('EZD-5603b B6 a transparent PNG is sent on a white fill', async ({ page, signInAs }) => {
    await ready(page, signInAs);
    const png = await sharp({
      create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    await pick(page, 'clear.png', 'image/png', png);
    await attached(page);
    const part = photoPart(await sendPrompt(page, 'what is in this photo'));
    expect(isJpeg(part)).toBe(true);
    const { data, info } = await sharp(part!).raw().toBuffer({ resolveWithObject: true });
    for (let c = 0; c < info.channels; c++) expect(data[c]!).toBeGreaterThanOrEqual(250);
  });

  test('EZD-5603b B4 the photo stays after a 429 and goes with the next send', async ({
    page,
    signInAs,
  }) => {
    await ready(page, signInAs);
    await pick(page, 'kitchen.jpg', 'image/jpeg', await jpeg(800, 600));
    await attached(page);
    await page.route(ASSISTANT_ROUTE, (r) =>
      r.fulfill({
        status: 429,
        json: {
          error: {
            code: 'assistant_provider_rate_limited',
            message_key: 'error.assistant_provider_rate_limited',
          },
        },
      }),
      { times: 1 },
    );
    await sendPrompt(page, 'what is in this photo');
    await expect(id(page, 'assistant-error')).toBeVisible();
    await expect(id(page, 'assistant-photo-thumb')).toBeVisible();
    await expect(id(page, 'assistant-photo-name')).toHaveText('kitchen.jpg');
    await expect(id(page, 'assistant-prompt')).toHaveValue('what is in this photo');
    await page.unroute(ASSISTANT_ROUTE);
    const again = await sendPrompt(page, 'what is in this photo');
    expect(isJpeg(photoPart(await again))).toBe(true);
  });

  test(
    'EZD-5603b B5 touch targets: the panel with a photo attached',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      await ready(page, signInAs);
      await pick(page, 'kitchen.jpg', 'image/jpeg', await jpeg(800, 600));
      await attached(page);
      expect(await expectTouchTargets(page, inspector(page))).toBeGreaterThanOrEqual(5);
    },
  );
});

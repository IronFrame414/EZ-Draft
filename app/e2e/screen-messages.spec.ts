// EZD-1995 (AC-EZD-1995-1; audit 2026-11-26 F1; Q-0814): a page sends only its own messages and a lazy screen loads
// only its own with its code; no file the browser can fetch holds the whole English catalog. Untagged, so desktop
// 1600 x 1000. Fixture S in its own company with its own member.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
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

// Keys of two screens no single page or lazy screen holds together: a countertops panel tab and a System status
// row. A file with both is the whole catalog (or most of it).
const EDITOR_ONLY = 'office.countertops.panel.tab_pieces';
const SETTINGS_ONLY = 'office.system_status.';
const wholeCatalog = (text: string) => text.includes(EDITOR_ONLY) && text.includes(SETTINGS_ONLY);

// A lock-ui message (the project switcher's label), which the editor page itself does not send.
const LOCK_UI_KEY = '"office.switcher.label"';
// The lock UI's slice is 85 short messages; the whole catalog is over 160,000 bytes.
const SLICE_MAX_BYTES = 20_000;

test.describe('EZD-1995 per-screen messages', () => {
  test.afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  test('AC-EZD-1995-1 no built browser file holds the whole catalog', () => {
    const dir = path.join(__dirname, '..', '.next', 'static', 'chunks');
    const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
    expect(files.length).toBeGreaterThan(0);
    const holders = files.filter((f) => wholeCatalog(readFileSync(path.join(dir, f), 'utf8')));
    expect(holders).toEqual([]);
    // The countertops screen's messages are in the build, in a small file of their own.
    const slices = files.filter((f) => readFileSync(path.join(dir, f), 'utf8').includes(`"${EDITOR_ONLY}"`));
    expect(slices.length).toBeGreaterThan(0);
  });

  test('AC-EZD-1995-1 an editor open and the first pointer move fetch the lock UI messages only, never the whole catalog', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, user.membershipId, ['view_projects', 'edit_model'] as never);
    await signInAs(user.email);

    const scripts: { url: string; body: Promise<string> }[] = [];
    page.on('response', (r) => {
      if (r.request().resourceType() !== 'script' || r.status() !== 200) return;
      scripts.push({ url: r.url(), body: r.text().catch(() => '') });
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const document = await page.goto(`/projects/${ids.P1}`);
    await expect(page.getByTestId('editor-state')).toHaveAttribute('data-editor-state', 'ready');
    await expect(page.getByTestId('plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
    const html = (await document?.text()) ?? '';
    expect(html).toContain('office.editor.');
    expect(wholeCatalog(html)).toBe(false);
    expect(html).not.toContain('office.switcher.label');

    const box = await page.locator('[data-shell-region="canvas"]').boundingBox();
    if (!box) throw new Error('canvas region has no box');
    const slice = page.waitForResponse(async (r) => {
      if (r.request().resourceType() !== 'script' || r.status() !== 200) return false;
      return (await r.text().catch(() => '')).includes(LOCK_UI_KEY);
    });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 40);
    const sliceBody = await (await slice).text();
    expect(sliceBody.length).toBeLessThan(SLICE_MAX_BYTES);
    expect(wholeCatalog(sliceBody)).toBe(false);

    await page.waitForLoadState('networkidle');
    const bodies = await Promise.all(scripts.map(async (s) => ({ url: s.url, body: await s.body })));
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.filter((s) => wholeCatalog(s.body)).map((s) => s.url)).toEqual([]);
    expect(errors.filter((e) => e.includes('Missing message'))).toEqual([]);
    await expect(page.getByTestId('editor-state')).toHaveAttribute('data-editor-state', 'ready');
  });
});

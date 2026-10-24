// EZD-032 B1, B3, B4 (vault/plans/EZD-032.md, Tests table). Phase 0 Build gate: a signed-in tenant 1 user
// sees the empty editor shell; a second-tenant user reads zero tenant 1 rows through the server path.
// Expected boxes come from the plan's formulas (EZD-014 B1/B8), W x H from the running project.
import {
  expect,
  test,
  signInAsOwner,
  JOSH_EMAIL,
  JOSH_USER_ID,
  TENANT_1_ID,
  TENANT_2_ID,
  TENANT_2_OWNER_EMAIL,
  TENANT_2_OWNER_USER_ID,
  seedProjectId,
} from '../test-harness/e2e/test';

const SHELL_PATH = '/dev/shell';

const VIEWPORTS: Record<string, { width: number; height: number }> = {
  desktop: { width: 1600, height: 1000 },
  'ipad-landscape': { width: 1180, height: 820 },
  surface: { width: 1440, height: 960 },
};

type Box = { x: number; y: number; width: number; height: number };

test.describe('EZD-032 phase 0 build gate @desktop @ipad @surface @smoke', () => {
  test('EZD-032 done when: a signed-in tenant 1 user sees the empty editor shell', async ({
    page,
  }, testInfo) => {
    const claims = await signInAsOwner(page);
    expect(claims.tenant_id).toBe(TENANT_1_ID);
    expect(claims.app_user_id).toBe(JOSH_USER_ID);
    expect(claims.email).toBe(JOSH_EMAIL);

    const response = await page.goto(SHELL_PATH);
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(SHELL_PATH);

    const size = page.viewportSize()!;
    const expected = VIEWPORTS[testInfo.project.name];
    expect(expected, `unknown project ${testInfo.project.name}`).toBeDefined();
    expect(size).toEqual(expected);
    const W = size.width;
    const H = size.height;

    const frame = page.locator('[data-shell-region=frame]');
    await expect(frame).toHaveCount(1);
    await expect(frame).toBeVisible();
    await expect(page.locator('[data-phone-region]')).toHaveCount(0);
    await expect(page.locator('[data-shell-region=frame] > header')).toHaveCount(1);
    for (const name of ['body', 'rail', 'left-panel', 'canvas', 'inspector', 'status-bar']) {
      const r = page.locator(`[data-shell-region=${name}]`);
      await expect(r, name).toHaveCount(1);
      await expect(r, name).toBeVisible();
    }
    await expect(page.locator('[data-rail-tool]')).toHaveCount(0);

    const boxes: Record<string, Box> = {
      header: { x: 16, y: 16, width: W - 32, height: 60 },
      rail: { x: 16, y: 92, width: 56, height: H - 154 },
      'left-panel': { x: 88, y: 92, width: 248, height: H - 154 },
      canvas: { x: 352, y: 92, width: W - 720, height: H - 154 },
      inspector: { x: W - 352, y: 92, width: 336, height: H - 154 },
      'status-bar': { x: 16, y: H - 46, width: W - 32, height: 30 },
    };
    for (const [name, want] of Object.entries(boxes)) {
      const loc =
        name === 'header'
          ? page.locator('[data-shell-region=frame] > header')
          : page.locator(`[data-shell-region=${name}]`);
      expect(await loc.boundingBox(), name).toEqual(want);
    }

    const scroll = await page.evaluate(() => ({
      w: document.documentElement.scrollWidth,
      h: document.documentElement.scrollHeight,
    }));
    expect(scroll).toEqual({ w: W, h: H });
  });

  test('EZD-032 done when: a second-tenant user reads zero tenant 1 rows through the server path', async ({
    sessions,
  }) => {
    test.setTimeout(120000);
    const [josh, t2] = await sessions.open([JOSH_EMAIL, TENANT_2_OWNER_EMAIL]);
    expect(t2.claims.tenant_id).toBe(TENANT_2_ID);
    expect(t2.claims.app_user_id).toBe(TENANT_2_OWNER_USER_ID);
    expect(t2.claims.project_scope).toBe('all');
    expect(josh.claims.tenant_id).toBe(TENANT_1_ID);

    const db2 = t2.serverDb;
    const dbJ = josh.serverDb;
    const twoIds = [seedProjectId(1), seedProjectId(200)];
    const ids = (rows: { id: string }[] | null) => (rows ?? []).map((r) => r.id).sort();

    const q1 = await db2
      .from('project')
      .select('id, tenant_id', { count: 'exact' })
      .eq('tenant_id', TENANT_1_ID);
    const q2 = await db2.from('project').select('id', { count: 'exact' }).in('id', twoIds);
    const q3 = await db2.from('project').select('id, tenant_id', { count: 'exact' });
    const q4 = await db2.from('tenant').select('id', { count: 'exact' }).eq('id', TENANT_1_ID);
    const q5 = await db2.from('tenant').select('id', { count: 'exact' });
    const q6 = await db2
      .from('membership')
      .select('id, tenant_id', { count: 'exact' })
      .eq('tenant_id', TENANT_1_ID);
    const q7 = await db2.from('membership').select('user_id, tenant_id', { count: 'exact' });
    const q8 = await db2
      .from('membership_project')
      .select('*', { count: 'exact' })
      .eq('tenant_id', TENANT_1_ID);
    const q9 = await db2.from('app_user').select('id', { count: 'exact' }).eq('id', JOSH_USER_ID);
    const q10 = await dbJ.from('project').select('id', { count: 'exact' }).in('id', twoIds);
    const q11 = await dbJ.from('tenant').select('id', { count: 'exact' });

    for (const [n, q] of Object.entries({ q1, q2, q3, q4, q5, q6, q7, q8, q9, q10, q11 })) {
      expect(q.error, `query ${n}`).toBeNull();
    }

    expect(q1.data).toEqual([]);
    expect(q1.count).toBe(0);
    expect(q2.data).toEqual([]);
    expect(q2.count).toBe(0);
    expect((q3.data ?? []).filter((r) => r.tenant_id === TENANT_1_ID)).toHaveLength(0);
    expect(q4.data).toEqual([]);
    expect(q4.count).toBe(0);
    expect(q6.data).toEqual([]);
    expect(q6.count).toBe(0);
    expect(q8.data).toEqual([]);
    expect(q8.count).toBe(0);
    expect(q9.data).toEqual([]);
    expect(q9.count).toBe(0);

    expect(ids(q5.data)).toEqual([TENANT_2_ID]);
    expect(q5.count).toBe(1);
    expect((q7.data ?? []).length).toBeGreaterThan(0);
    expect((q7.data ?? []).every((r) => r.tenant_id === TENANT_2_ID)).toBe(true);
    expect((q7.data ?? []).map((r) => r.user_id)).toContain(TENANT_2_OWNER_USER_ID);
    expect(ids(q10.data)).toEqual([...twoIds].sort());
    expect(q10.count).toBe(2);
    expect(ids(q11.data)).toEqual([TENANT_1_ID]);
    expect(q11.count).toBe(1);
  });

  test('EZD-032 a request without the server gate header is refused', async ({ signInAs }) => {
    const t2 = await signInAs(TENANT_2_OWNER_EMAIL);
    const refused = await t2.browserDb.from('project').select('id');
    expect(refused.data).toBeNull();
    expect(refused.error).not.toBeNull();
    expect(refused.error?.code).toBe('42501');
    expect(refused.status < 200 || refused.status > 299).toBe(true);

    const allowed = await t2.serverDb.from('project').select('id');
    expect(allowed.error).toBeNull();
  });
});

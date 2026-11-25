// EZD-111 B1-B8 (vault/plans/EZD-111.md section 4; AC-EZD-111-1 to -3, -6, -7). B1-B7 are untagged (desktop
// 1600 x 1000); B8 is @ipad. Every test makes its own company (never tenant 1) with fixture S
// (app/test-harness/projects-fixture.ts: P1 "bravo", client "Zed Co" zedco@example.test; P2 "Alpha", no client).
// Expected values: section 6 wording (the To separator U+00B7, "Sending…" with U+2026); R24 #15 and 04:26 (Copy
// link beside Send, the same link as the email); Q-0700 (no client refused, email failure still shows Copy link,
// the outbox drained first); 03b rule 8 (holder notice with the newest saved object's time, en-US clock); 44 px
// touch targets (app/test-harness/touch-targets.ts). The sender's own copy of the email (Q-0701, EZD-389) is
// left out by reading only the messages to the client.
import type { Page } from '@playwright/test';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  expectTouchTargets,
  harnessSql,
  readStubOutboxDir,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { seedFixtureS } from '../test-harness/projects-fixture';

const SENDER = ['view_projects', 'edit_model', 'send_to_client'];
const EDITOR = ['view_projects', 'edit_model'];
const CLIENT_EMAIL = 'zedco@example.test';
const SENDS_ROUTE = '**/api/projects/*/sends';
const RECIPIENT_ROUTE = '**/api/projects/*/send-recipient';

async function member(tenant: string, permissions: string[]) {
  const m = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, m.membershipId, permissions as never);
  return m;
}

async function fixtureS(permissions: string[] = SENDER) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  return { tenant, ids, user: await member(tenant, permissions) };
}

const id = (page: Page, testId: string) => page.getByTestId(testId);
const dialog = (page: Page) => id(page, 'send-dialog');

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
}

async function openSend(page: Page) {
  await id(page, 'header-share').click();
  await expect(dialog(page)).toBeVisible();
}

const toClient = (link: string) =>
  readStubOutboxDir(process.env.EMAIL_STUB_DIR as string).filter(
    (m) => m.to === CLIENT_EMAIL && m.text.includes(link),
  );

type Hook = {
  objects(): Array<{ id: string; type: string; data: Record<string, unknown> }>;
  edit(changes: unknown[]): string[];
};

// E(n): rename the floor to n through the test hook (copy of app/e2e/editor.spec.ts).
const E = (page: Page, n: string) =>
  page.evaluate((name) => {
    const hook = (window as unknown as { __ezdraftEditor: Hook }).__ezdraftEditor;
    const floor = hook.objects().find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return hook.edit([
      { id: floor.id, value: { type: 'floor', schemaVersion: 1, data: { name, order: 1 } } },
    ]);
  }, n);

test.describe('EZD-111 Send dialog', () => {
  // page.route must see the API calls (B4, B6, B8), so the app's service worker is kept out, as
  // assistant-panel.spec.ts does.
  test.use({ serviceWorkers: 'block' });

  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-111 B1 @smoke done when: Send emails the client, then Copy link copies the same link', async ({
    page,
    signInAs,
  }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await openSend(page);
    await expect(id(page, 'send-to')).toHaveText('Zed Co · zedco@example.test');
    await expect(dialog(page)).toHaveAttribute('data-send-state', 'ready');
    await id(page, 'send-submit').click();
    await expect(dialog(page)).toHaveAttribute('data-send-state', 'sent');
    await expect(id(page, 'send-copy-link')).toBeVisible();
    const link = (await id(page, 'send-copy-link').getAttribute('data-link')) as string;
    expect(link).toMatch(/\/c\/[A-Za-z0-9_-]{43}$/);
    await expect.poll(() => toClient(link).length).toBe(1);
    await id(page, 'send-copy-link').click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(link);
    await expect(id(page, 'send-status')).toHaveAttribute('data-email-sent', 'true');
    await expect(id(page, 'send-status')).toHaveText('Sent to Zed Co.');
  });

  test('EZD-111 B2 without Send to client there is no Share button', async ({ page, signInAs }) => {
    const { ids, user } = await fixtureS(EDITOR);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await expect(id(page, 'header-share')).toHaveCount(0);
  });

  test('EZD-111 B3 a project with no client says so, links to Project settings and sends nothing', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    const sends: string[] = [];
    page.on('request', (r) => {
      if (/\/api\/projects\/[^/]+\/sends$/.test(new URL(r.url()).pathname)) sends.push(r.url());
    });
    await signInAs(user.email);
    await openReady(page, ids.P2);
    await openSend(page);
    await expect(dialog(page)).toHaveAttribute('data-send-state', 'no-client');
    await expect(id(page, 'send-no-client')).toHaveText(
      "This project has no client with an email, so it can't be sent. Add one in Project settings.",
    );
    await expect(id(page, 'send-project-settings')).toBeVisible();
    await expect(id(page, 'send-submit')).toHaveCount(0);
    expect(sends).toEqual([]);
  });

  test('EZD-111 B4 when the email did not go, the dialog says so and still shows Copy link', async ({
    page,
    signInAs,
  }) => {
    const link = 'http://127.0.0.1:3000/c/' + 'A'.repeat(43);
    const { ids, user } = await fixtureS();
    await page.route(SENDS_ROUTE, (route) =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          send: {
            id: '00000000-0000-4000-8000-000000000001',
            modelVersionId: '00000000-0000-4000-8000-000000000002',
            versionNo: 1,
            link,
            emailSent: false,
            recipient: { name: 'Zed Co', email: CLIENT_EMAIL },
            holder: null,
            expiresAt: '2026-12-17T00:00:00.000Z',
          },
        }),
      }),
    );
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await openSend(page);
    await expect(dialog(page)).toHaveAttribute('data-send-state', 'ready');
    await id(page, 'send-submit').click();
    await expect(id(page, 'send-status')).toHaveAttribute('data-email-sent', 'false');
    await expect(id(page, 'send-status')).toHaveText(
      "The email didn't go. Copy the link and send it another way.",
    );
    await expect(id(page, 'send-copy-link')).toHaveAttribute('data-link', link);
  });

  test('EZD-111 B5 a send while someone else holds the lock shows the holder notice with their saved time', async ({
    page,
    signInAs,
  }) => {
    const { tenant, ids, user } = await fixtureS();
    const dana = await member(tenant, EDITOR);
    await adminDb().from('app_user').update({ name: 'Dana Holder' }).eq('id', dana.appUserId);
    const sql = harnessSql();
    await sql`insert into public.edit_lock (project_id, tenant_id, lock_epoch, holder_app_user_id, since)
      values (${ids.P1}::uuid, ${tenant}::uuid, 5, ${dana.appUserId}::uuid, now())
      on conflict (project_id) do update set lock_epoch = 5, holder_app_user_id = excluded.holder_app_user_id,
        since = excluded.since`;
    await sql`update public.model_object set updated_at = '2026-11-01T10:00:00Z'::timestamptz
      where project_id = ${ids.P1}::uuid`;
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await openSend(page);
    await expect(dialog(page)).toHaveAttribute('data-send-state', 'ready');
    await id(page, 'send-submit').click();
    await expect(dialog(page)).toHaveAttribute('data-send-state', 'sent');
    const time = await page.evaluate(() =>
      new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(
        Date.parse('2026-11-01T10:00:00Z'),
      ),
    );
    await expect(id(page, 'send-holder-notice')).toHaveText(
      `Dana Holder is editing; this send includes their saved changes up to ${time}`,
    );
  });

  test('EZD-111 B6 Send is disabled while sending (one request), after the send and offline', async ({
    page,
    signInAs,
    context,
  }) => {
    const { ids, user } = await fixtureS();
    let posts = 0;
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(SENDS_ROUTE, async (route) => {
      posts++;
      await held;
      await route.continue();
    });
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await openSend(page);
    await expect(dialog(page)).toHaveAttribute('data-send-state', 'ready');
    await id(page, 'send-submit').dblclick();
    await expect(id(page, 'send-submit')).toBeDisabled();
    await expect(id(page, 'send-submit')).toHaveText('Sending…');
    await expect.poll(() => posts).toBe(1);
    release();
    await expect(dialog(page)).toHaveAttribute('data-send-state', 'sent');
    await expect(id(page, 'send-submit')).toBeDisabled();
    expect(posts).toBe(1);

    // (b) offline
    await id(page, 'send-cancel').click();
    await expect(dialog(page)).toHaveCount(0);
    await page.unroute(SENDS_ROUTE);
    await openSend(page);
    await expect(dialog(page)).toHaveAttribute('data-send-state', 'ready');
    await context.setOffline(true);
    await expect(id(page, 'send-submit')).toBeDisabled();
    await context.setOffline(false);
  });

  test('EZD-111 B7 the outbox is drained first: the send checkpoint holds the edit just made', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const order: string[] = [];
    page.on('response', (r) => {
      if (/\/api\/projects\/[^/]+\/objects$/.test(new URL(r.url()).pathname)) order.push('save-response');
    });
    page.on('request', (r) => {
      if (/\/api\/projects\/[^/]+\/sends$/.test(new URL(r.url()).pathname)) order.push('send-request');
    });
    await openSend(page);
    await expect(dialog(page)).toHaveAttribute('data-send-state', 'ready');
    const answered = page.waitForResponse((r) => /\/api\/projects\/[^/]+\/sends$/.test(r.url()));
    await E(page, 'Sent floor');
    await id(page, 'send-submit').click();
    const res = await answered;
    expect(res.status()).toBe(201);
    const body = (await res.json()) as { send: { modelVersionId: string } };
    expect(order.indexOf('save-response')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('save-response')).toBeLessThan(order.indexOf('send-request'));
    const { data, error } = await adminDb()
      .from('model_version')
      .select('model_json')
      .eq('id', body.send.modelVersionId)
      .single();
    expect(error).toBeNull();
    const objects = (data?.model_json as { objects: Array<{ type: string; data: { name?: string } }> })
      .objects;
    expect(objects.find((o) => o.type === 'floor')?.data.name).toBe('Sent floor');
  });

  test(
    'EZD-111 B8 the dialog touch targets are 44 px on iPad in each state',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      const { ids, user } = await fixtureS();
      await signInAs(user.email);
      await openReady(page, ids.P1);
      await openSend(page);
      await expect(dialog(page)).toHaveAttribute('data-send-state', 'ready');
      expect(await expectTouchTargets(page, dialog(page))).toBe(3);
      await id(page, 'send-submit').click();
      await expect(dialog(page)).toHaveAttribute('data-send-state', 'sent');
      // EZD-1201: the sent link's row adds Renew and Turn off.
      await expect(id(page, 'share-link')).toHaveCount(1);
      expect(await expectTouchTargets(page, dialog(page))).toBe(6);
      await id(page, 'send-cancel').click();
      await expect(dialog(page)).toHaveCount(0);

      await openReady(page, ids.P2);
      await openSend(page);
      await expect(dialog(page)).toHaveAttribute('data-send-state', 'no-client');
      expect(await expectTouchTargets(page, dialog(page))).toBe(2);
      await id(page, 'send-cancel').click();

      await page.route(RECIPIENT_ROUTE, (route) =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } }),
        }),
      );
      await openReady(page, ids.P1);
      await openSend(page);
      await expect(dialog(page)).toHaveAttribute('data-send-state', 'load-failed');
      expect(await expectTouchTargets(page, dialog(page))).toBe(2);
    },
  );
});

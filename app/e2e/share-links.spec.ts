// EZD-1201 (AC-EZD-1201-1, -2; Q-0213 Share panel; S18 States "Expired: ... Contractor renews for 30 days"; 11
// Security "renewable, revocable"). Desktop 1600 x 1000. Every test makes its own company with fixture S
// (app/test-harness/projects-fixture.ts: P1 with client "Zed Co"). A link is aged by backdating created_at and
// expires_at through the service-role harness (Q-0697: SQL now() cannot be faked).
import type { Page } from '@playwright/test';
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

const SENDER = ['view_projects', 'edit_model', 'send_to_client'];
const DAY_MS = 24 * 60 * 60 * 1000;

const id = (page: Page, testId: string) => page.getByTestId(testId);

async function fixtureS() {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, user.membershipId, SENDER as never);
  return { ids, user };
}

async function openSend(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await id(page, 'header-share').click();
  await expect(id(page, 'send-dialog')).toBeVisible();
}

async function resolveStatus(page: Page, token: string): Promise<number> {
  // From the page, as the client page calls it (same origin).
  return page.evaluate(async (t) => {
    const res = await fetch('/api/share-links/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: t }),
    });
    return res.status;
  }, token);
}

test.describe('EZD-1201 Share links', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-1201 L1 @smoke done when: an expired link answers expired, and Renew restores it for 30 days', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openSend(page, ids.P1);
    await id(page, 'send-submit').click();
    await expect(id(page, 'send-dialog')).toHaveAttribute('data-send-state', 'sent');
    const link = (await id(page, 'send-copy-link').getAttribute('data-link')) as string;
    const token = link.split('/').pop() as string;
    const row = id(page, 'share-link');
    await expect(row).toHaveCount(1);
    await expect(row).toHaveAttribute('data-status', 'active');
    await expect(id(page, 'share-link-state')).toHaveText(/^On · expires /);
    const linkId = (await row.getAttribute('data-link-id')) as string;
    expect(await resolveStatus(page, token)).toBe(200);

    await harnessSql()`update public.sent_package set created_at = now() - interval '31 days',
      expires_at = now() - interval '1 second' where id = ${linkId}::uuid`;
    expect(await resolveStatus(page, token)).toBe(410);

    await id(page, 'send-cancel').click();
    await openSend(page, ids.P1);
    await expect(row).toHaveAttribute('data-status', 'expired');
    await expect(id(page, 'share-link-state')).toHaveText(/^Expired /);

    const before = Date.now();
    await id(page, 'share-link-renew').click();
    await expect(row).toHaveAttribute('data-status', 'active');
    const [stored] = await harnessSql()<{ expires_at: Date }[]>`
      select expires_at from public.sent_package where id = ${linkId}::uuid`;
    expect(stored.expires_at.getTime()).toBeGreaterThan(before + 30 * DAY_MS - 60_000);
    expect(stored.expires_at.getTime()).toBeLessThan(Date.now() + 30 * DAY_MS + 60_000);
    const shown = await page.evaluate(
      (iso) =>
        new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
          new Date(iso),
        ),
      stored.expires_at.toISOString(),
    );
    await expect(id(page, 'share-link-state')).toHaveText(`On · expires ${shown}`);
    expect(await resolveStatus(page, token)).toBe(200);
  });

  test('EZD-1201 L2 Turn off ends the link and leaves no Renew', async ({ page, signInAs }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openSend(page, ids.P1);
    await id(page, 'send-submit').click();
    await expect(id(page, 'send-dialog')).toHaveAttribute('data-send-state', 'sent');
    const token = ((await id(page, 'send-copy-link').getAttribute('data-link')) as string).split('/').pop() as string;
    await id(page, 'share-link-revoke').click();
    await expect(id(page, 'share-link')).toHaveAttribute('data-status', 'revoked');
    await expect(id(page, 'share-link-state')).toHaveText('Off');
    await expect(id(page, 'share-link-renew')).toHaveCount(0);
    expect(await resolveStatus(page, token)).toBe(404);
  });
});

// EZD-110a T17a (vault/plans/EZD-110a.md section 4; AC-EZD-110-5, -8; Q-0422). Untagged, so desktop only. A fresh
// tenant with an all-scope member holding view_projects signs in, opens /dev/notifications and presses the
// render_finished button; the page shows the new id and the stored link "/", and the stub transport records
// one email to the member whose link is http://localhost:3000/ (appOrigin local value). The stub folder is
// shared with other specs, so only messages to this member count.
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  linksIn,
  readStubOutboxDir,
  setPermissions,
  test,
} from '../test-harness/e2e/test';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test.describe('EZD-110a notifications dev page', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-110a T17a sending render_finished shows the id and link and emails the member one link to the home page', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const member = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, member.membershipId, ['view_projects']);
    await signInAs(member.email);

    await page.goto('/dev/notifications');
    await page.getByTestId('dev-notify-render_finished').click();

    await expect(page.getByTestId('dev-notify-result')).toHaveText(UUID);
    await expect(page.getByTestId('dev-notify-link')).toHaveText('/');

    const emailDir = process.env.EMAIL_STUB_DIR as string;
    const mine = () =>
      readStubOutboxDir(emailDir).filter((m) => m.to.toLowerCase() === member.email.toLowerCase());
    await expect.poll(() => mine().length, { timeout: 10000 }).toBe(1);
    expect(linksIn(mine()[0]).text).toContain('http://localhost:3000/');
  });
});

// EZD-5601 T22 (vault/plans/EZD-5601.md section 4, section 6 wording, section 3 data-testid rows; AC-EZD-5601-1,
// -2, -5, -8, -9). Untagged, so desktop only. Serial: the first test only looks, the second adds, reopens and
// removes a key. Sign-in and dialog opening copy app/e2e/my-profile.spec.ts. A refused key is staged by writing
// ${AI_STUB_DIR}/anthropic/key-check.json (a 401 answer, removed in `finally`); the other add uses the built-in
// recording. Stub emails are read from EMAIL_STUB_DIR. The canary is never compared with anything but includes.
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { PERMISSION_KEYS } from '../src/lib/permissions/catalog';
import {
  cleanup,
  cleanupTestMembers,
  closeHarness,
  createMember,
  createTenant,
  expect,
  readStubOutboxDir,
  setPermissions,
  test,
} from '../test-harness/e2e/test';

const CANARY = 'sk-ant-api03-EZD5601CANARY' + randomUUID().replaceAll('-', '');
const LAST4 = CANARY.slice(-4);
const tid = (page: Page, id: string) => page.getByTestId(id);
const stubMail = (email: string) =>
  readStubOutboxDir(process.env.EMAIL_STUB_DIR as string).filter(
    (m) => m.to.toLowerCase() === email.toLowerCase(),
  );

async function makePerson(allSwitches: boolean) {
  const tenant = await createTenant();
  const m = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, m.membershipId, allSwitches ? PERMISSION_KEYS : []);
  return m;
}

async function openProfile(page: Page) {
  await tid(page, 'avatar-menu-trigger').click();
  await expect(tid(page, 'avatar-menu')).toBeVisible();
  await tid(page, 'avatar-menu-profile').click();
  await expect(tid(page, 'my-profile-dialog')).toBeVisible();
  await expect(tid(page, 'profile-ai-section')).toBeVisible();
}

test.describe('EZD-5601 AI key in My profile', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterAll(async () => {
    await cleanupTestMembers();
    await cleanup();
    await closeHarness();
  });

  test('T22 the AI assistant section shows for an owner and for a member without permissions', async ({
    page,
    signInAs,
  }) => {
    const owner = await makePerson(true);
    await signInAs(owner.email);
    await page.goto('/settings/company');
    await expect(tid(page, 'avatar-menu-trigger')).toBeVisible();
    await openProfile(page);
    await expect(tid(page, 'profile-ai-heading')).toHaveText('AI assistant');
    await expect(tid(page, 'profile-ai-key-input')).toBeVisible();
    await expect(tid(page, 'profile-ai-key-add')).toBeVisible();
  });

  test('T22 a refused key stores nothing; an accepted one shows its last four, survives a reopen and goes on Remove', async ({
    page,
    signInAs,
  }) => {
    const member = await makePerson(false);
    await signInAs(member.email);
    await page.goto('/settings/company');
    await expect(tid(page, 'avatar-menu-trigger')).toBeVisible();
    await openProfile(page);
    await expect(tid(page, 'profile-ai-heading')).toHaveText('AI assistant');

    const dir = path.join(process.env.AI_STUB_DIR as string, 'anthropic');
    const file = path.join(dir, 'key-check.json');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      file,
      JSON.stringify({
        provider: 'anthropic',
        purpose: 'key-check',
        source: 'synthetic',
        exchanges: [
          {
            match: { method: 'GET', url: 'https://api.anthropic.com/v1/models*' },
            response: {
              status: 401,
              json: {
                type: 'error',
                error: { type: 'authentication_error', message: 'invalid x-api-key' },
                request_id: 'req_1',
              },
            },
          },
        ],
      }),
    );
    try {
      await tid(page, 'profile-ai-key-input').fill(CANARY);
      await tid(page, 'profile-ai-key-add').click();
      await expect(tid(page, 'profile-ai-key-message')).toHaveText(
        "Anthropic didn't accept this key. Nothing was saved. Check the key and paste it again.",
      );
      await expect(tid(page, 'profile-ai-key-input')).toBeVisible();
      await expect(tid(page, 'profile-ai-key-saved')).toHaveCount(0);
    } finally {
      rmSync(file, { force: true });
    }

    await tid(page, 'profile-ai-key-add').click();
    await expect(tid(page, 'profile-ai-key-saved')).toBeVisible();
    await expect(tid(page, 'profile-ai-key-saved')).toContainText('Key saved · ends in');
    await expect(tid(page, 'profile-ai-key-last4')).toHaveText(LAST4);
    expect((await page.content()).includes(CANARY)).toBe(false);

    await tid(page, 'my-profile-close').click();
    await expect(tid(page, 'my-profile-dialog')).toHaveCount(0);
    await openProfile(page);
    await expect(tid(page, 'profile-ai-key-saved')).toBeVisible();
    await expect(tid(page, 'profile-ai-key-last4')).toHaveText(LAST4);
    expect((await page.content()).includes(CANARY)).toBe(false);

    await tid(page, 'profile-ai-key-remove').click();
    await expect(tid(page, 'profile-ai-key-input')).toBeVisible();
    await expect(tid(page, 'profile-ai-key-saved')).toHaveCount(0);
    expect((await page.content()).includes(CANARY)).toBe(false);

    await expect.poll(() => stubMail(member.email).length).toBe(2);
    expect(JSON.stringify(stubMail(member.email)).includes(CANARY)).toBe(false);
  });
});

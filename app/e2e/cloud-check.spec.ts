// EZD-171 T13 (vault/plans/EZD-171.md section 4). Untagged: desktop only; not smoke.
import { expect, signInAsOwner, test } from '../test-harness/e2e/test';

async function readResult(page: import('@playwright/test').Page) {
  await page.goto('/dev/cloud-check');
  const pre = page.getByTestId('cloud-check-result');
  await expect(pre).toHaveAttribute('data-state', 'done');
  return JSON.parse((await pre.textContent()) ?? '{}');
}

test.describe('EZD-171 cloud check page', () => {
  test('EZD-171 T13 (a) signed out: values read, session not checked', async ({ page }) => {
    const r = await readResult(page);
    expect(r.plain.vercelEnv).toBeNull();
    expect(r.plain.clientIp).toBeNull();
    expect(r.withFakeHeader.vercelEnv).toBeNull();
    expect(r.plain.session).toEqual({ signedIn: false, tenantClaim: false, gate: 'not_checked' });
  });

  test('EZD-171 T13 (b) signed in: tenant claim and gate accepted', async ({ page }) => {
    await signInAsOwner(page);
    const r = await readResult(page);
    expect(r.plain.vercelEnv).toBeNull();
    expect(r.plain.clientIp).toBeNull();
    expect(r.withFakeHeader.vercelEnv).toBeNull();
    expect(r.plain.session).toEqual({ signedIn: true, tenantClaim: true, gate: 'accepted' });
  });
});

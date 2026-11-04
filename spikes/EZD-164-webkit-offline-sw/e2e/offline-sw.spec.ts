// EZD-164 E1 (vault/plans/EZD-164.md section 4): reload a caching worker's page with the network off.
// The measured booleans are the answer; the spike's summarize step turns them into yes or no.
import { test as plainTest, expect as plainExpect, type Page } from '@playwright/test';
import { test as harnessTest } from '../../../app/test-harness/e2e/test';
import {
  SW_OFFLINE_PAGE,
  SW_OFFLINE_CACHE,
  SW_OFFLINE_UNCACHED_URL,
} from '../../../app/src/app/dev/sw-offline/constants';

const IDS = [
  'registered',
  'controlled',
  'cached',
  'offline_flag',
  'offline_reload',
  'same_render',
  'controlled_offline',
  'hydrated_offline',
  'uncached_fails',
] as const;
type CheckId = (typeof IDS)[number];
const POLL = { timeout: 10_000 };
const TAGS = ['@desktop', '@ipad', '@phone'];

async function runChecks(
  page: Page,
  variant: 'V1' | 'V2',
  browserName: string,
  browserVersion: string,
  projectName: string,
  goOffline: () => Promise<void>,
  goOnline: () => Promise<void>,
): Promise<CheckId[]> {
  const checks = {} as Record<CheckId, boolean>;
  const check = async (id: CheckId, fn: () => Promise<boolean>) => {
    try {
      checks[id] = (await fn()) === true;
    } catch {
      checks[id] = false;
    }
  };
  const attr = (testid: string, name: string) =>
    page.getByTestId(testid).getAttribute(name);
  let r2: string | null = null;

  await page.goto(SW_OFFLINE_PAGE);
  await check('registered', async () => {
    await plainExpect
      .poll(() => attr('sw-offline-probe', 'data-sw-state'), POLL)
      .toBe('registered');
    return true;
  });
  await check('controlled', async () => {
    await plainExpect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), POLL)
      .toBe(true);
    return true;
  });
  await page.reload();
  r2 = await attr('sw-offline-page', 'data-render-id').catch(() => null);
  await check('cached', async () => {
    await plainExpect
      .poll(
        () =>
          page.evaluate(
            (name) =>
              caches
                .open(name)
                .then((c) => c.match(location.href, { ignoreVary: true }))
                .then((r) => r !== undefined),
            SW_OFFLINE_CACHE,
          ),
        POLL,
      )
      .toBe(true);
    return true;
  });
  await goOffline();
  await check('offline_flag', async () => (await page.evaluate(() => navigator.onLine)) === false);
  await check('offline_reload', async () => {
    await page.reload();
    return true;
  });
  await check('same_render', async () => {
    const now = await attr('sw-offline-page', 'data-render-id');
    return r2 !== null && now === r2;
  });
  await check('controlled_offline', () =>
    page.evaluate(() => navigator.serviceWorker.controller !== null),
  );
  await check('hydrated_offline', async () => {
    await plainExpect.poll(() => attr('sw-offline-probe', 'data-sw-hydrated'), POLL).toBe('yes');
    return true;
  });
  await check('uncached_fails', async () => {
    const out = await page.evaluate(
      (u) =>
        fetch(u).then(
          (r) => 'status ' + r.status,
          () => 'failed',
        ),
      SW_OFFLINE_UNCACHED_URL,
    );
    return out === 'failed';
  });

  const ordered = Object.fromEntries(IDS.map((id) => [id, checks[id] === true]));
  console.log(
    'EZD-164 RESULT ' +
      JSON.stringify({
        project: projectName,
        variant,
        browser: browserName,
        version: browserVersion,
        checks: ordered,
      }),
  );
  try {
    await goOnline();
  } catch {
    // the page is closed after the run anyway
  }
  return IDS.filter((id) => ordered[id] === false);
}

harnessTest.describe('EZD-164 WebKit offline service worker (V1 harness)', { tag: TAGS }, () => {
  harnessTest('EZD-164 V1 offline reload', async ({ page, network, browserName, browser }, info) => {
    const failedIds = await runChecks(
      page,
      'V1',
      browserName,
      browser.version(),
      info.project.name,
      () => network.set(page, 'off'),
      () => network.set(page, 'on'),
    );
    plainExpect(failedIds).toEqual([]);
  });
});

plainTest.describe('EZD-164 WebKit offline service worker (V2 plain)', { tag: TAGS }, () => {
  plainTest('EZD-164 V2 offline reload', async ({ page, browserName, browser }, info) => {
    const failedIds = await runChecks(
      page,
      'V2',
      browserName,
      browser.version(),
      info.project.name,
      () => page.context().setOffline(true),
      () => page.context().setOffline(false),
    );
    plainExpect(failedIds).toEqual([]);
  });
});

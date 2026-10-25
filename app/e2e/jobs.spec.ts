// EZD-009 T1 (vault/plans/EZD-009.md Tests; AC-EZD-009-1): a test job runs, reports progress and result over
// Realtime, and the page stays usable. Untagged, so desktop only. Fresh tenant, project and member from
// EZD-006's fixtures through the harness test.ts, removed in afterAll. Selectors: Step 7. Wait limit 20,000 ms
// for the whole job (plan T1); the job runs after the enqueue response (Step 5 kick). Expected values: T1's
// row (progress values from the test handler: round(100 x i / 3); 4,000 ms = 3 x 1,500 ms less 500 ms).
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  expect,
  harnessSql,
  setPermissions,
  test,
} from '../test-harness/e2e/test';

const STEPS = 3;
const STEP_MS = 1500;

test.describe('EZD-009 background jobs', () => {
  let tenantA = '';

  test.afterAll(async () => {
    try {
      if (tenantA) await harnessSql()`delete from public.job where tenant_id = ${tenantA}::uuid`;
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-009 done when: a test job runs, reports progress and result, and the UI stays usable', async ({
    page,
    signInAs,
  }) => {
    tenantA = await createTenant();
    const [project] = await createProjects(tenantA, 1);
    const a = await createMember({ tenantId: tenantA, scope: 'all' });
    // EZD-145 D11: createMember gives no switches; the page enqueues (Edit model) and reads (View projects).
    await setPermissions(tenantA, a.membershipId, ['view_projects', 'edit_model']);
    await signInAs(a.email);

    // Leak check (EZD-007f T21 pattern, app/e2e/gate-secret.spec.ts): the secret key the server runner uses
    // never appears in a response body or header the page receives. A blank key would make this pass on nothing.
    const secretKey = process.env.SUPABASE_SECRET_KEY ?? '';
    expect(secretKey.length).toBeGreaterThan(0);
    const seen: Promise<{ url: string; headers: string[]; body: string }>[] = [];
    page.on('response', (r) => {
      seen.push(
        (async () => {
          const headers = Object.values(await r.allHeaders());
          let body = '';
          try {
            body = (await r.body()).toString('utf8');
          } catch {
            // Redirect responses have no body.
          }
          return { url: r.url(), headers, body };
        })(),
      );
    });

    let enqueueStatus = 0;
    let enqueueBody: { job?: { status?: string } } = {};
    page.on('response', async (response) => {
      if (response.request().method() === 'POST' && response.url().includes('/api/dev/jobs')) {
        enqueueStatus = response.status();
        enqueueBody = (await response.json()) as typeof enqueueBody;
      }
    });

    // One 20,000 ms limit from page load for all six events (plan T1).
    const deadline = Date.now() + 20_000;
    const left = () => Math.max(1, deadline - Date.now());
    await page.goto(`/dev/jobs?project=${project}&steps=${STEPS}&stepMs=${STEP_MS}`);

    const items = page.locator('[data-testid=job-events] li');
    await expect
      .poll(async () => items.evaluateAll((els) => els.map((e) => e.getAttribute('data-status'))), {
        timeout: left(),
      })
      .toContain('running');

    // Record from the first running event: requests, main-frame navigations and long tasks.
    const requests: string[] = [];
    let navigations = 0;
    page.on('request', (r) => requests.push(`${r.method()} ${new URL(r.url()).pathname}`));
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigations++;
    });
    await page.evaluate(() => {
      const w = window as unknown as { __ezdLongTasks: number };
      w.__ezdLongTasks = 0;
      new PerformanceObserver((list) => {
        w.__ezdLongTasks += list.getEntries().length;
      }).observe({ type: 'longtask' });
    });

    // The page stays usable while the job runs.
    await expect(page.getByTestId('job-status')).toHaveText('running');
    for (let i = 0; i < 5; i++) await page.getByTestId('job-ping').click();
    await expect(page.getByTestId('job-ping')).toHaveText('5');
    await expect(page.getByTestId('job-status')).toHaveText('running');
    expect(requests).toEqual([]);

    await expect(page.getByTestId('job-status')).toHaveText('done', { timeout: left() });
    await page.waitForTimeout(3_000);

    const jobId = (await page.getByTestId('job-id').textContent())?.trim() ?? '';
    expect(jobId.length).toBeGreaterThan(0);
    expect(enqueueStatus).toBe(201);
    expect(enqueueBody.job?.status).toBe('queued');

    const events = await items.evaluateAll((els) =>
      els.map((e) => [e.getAttribute('data-status'), Number(e.getAttribute('data-progress'))]),
    );
    expect(events).toEqual([
      ['queued', 0],
      ['running', 0],
      ['running', 33],
      ['running', 67],
      ['running', 100],
      ['done', 100],
    ]);
    await expect(page.getByTestId('job-progress')).toHaveText('100');
    expect(JSON.parse((await page.getByTestId('job-result').textContent()) ?? '')).toEqual({
      steps: STEPS,
    });

    const enqueuedAt = Number(
      await page
        .locator('div[data-testid=jobs-probe][data-enqueued-at]')
        .first()
        .getAttribute('data-enqueued-at'),
    );
    const doneAt = Number(
      await page
        .locator('div[data-testid=jobs-probe][data-done-at]')
        .first()
        .getAttribute('data-done-at'),
    );
    expect(doneAt - enqueuedAt).toBeGreaterThanOrEqual(4000);

    expect(requests).toEqual([`GET /api/jobs/${jobId}`]);
    expect(navigations).toBe(0);
    expect(
      await page.evaluate(() => (window as unknown as { __ezdLongTasks: number }).__ezdLongTasks),
    ).toBe(0);

    const all = await Promise.all(seen);
    expect(all.length).toBeGreaterThan(0);
    expect(all.filter((x) => x.body.includes(secretKey)).map((x) => x.url)).toHaveLength(0);
    expect(
      all.filter((x) => x.headers.some((h) => h.includes(secretKey))).map((x) => x.url),
    ).toHaveLength(0);
  });
});

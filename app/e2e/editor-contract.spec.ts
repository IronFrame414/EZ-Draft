// EZD-1901 (AC-EZD-1901-1; vault/plans/editor-consolidation-2026-11-23.md section 2.2, 2.4, 2.6): the editor feature
// contract on a real plan, as src/editor/contract/editor-contract.test.tsx lists it. Untagged, so desktop 1600 x 1000.
// Its own company with fixture S (P1 "bravo", floor "Floor 1"), an editor member. Checks the floor rail tools, the
// bottom rail, the six plain-plan status items, the left panel tabs and the dev hooks' names and members (many e2e
// specs read them). Rail order is not pinned (section 2.2 is a list; the order is per user, EZD-230).
import type { Page } from '@playwright/test';
import {
  createMember,
  createTenant,
  expect,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { seedFixtureS } from '../test-harness/projects-fixture';

// Section 2.2 floor rail, 13 top tools (Ceiling is added when the plan has a surface).
const FLOOR_RAIL = [
  'select',
  'move',
  'wall',
  'room-rect',
  'door',
  'window',
  'fixtures',
  'sketch',
  'measure',
  'cabinets',
  'countertops',
  'electrical',
  'ceiling',
];
// Section 2.6 dev hooks and their members.
const HOOKS: Record<string, string[]> = {
  __ezdraftEditor: ['checkpoint', 'edit', 'objects'],
  __ezdraftPlan: ['drawn', 'drawnTexts', 'handle', 'phase', 'stats', 'underlay'],
  __ezdraftSelection: ['hoveredId', 'ids'],
};

const tid = (page: Page, id: string) => page.getByTestId(id);
const rail = (page: Page, group: 'top' | 'bottom') =>
  page.locator(`[data-shell-region="rail"] [data-rail="${group}"] [data-rail-tool]`);

test.describe('EZD-1901 editor feature contract', () => {
  test('AC-EZD-1901-1 a plain plan keeps its rail tools, status items, left panel tabs and dev hooks', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const m = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, m.membershipId, ['view_projects', 'edit_model'] as never);
    await signInAs(m.email);
    await page.goto(`/projects/${ids.P1}`);
    await expect(tid(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
    await expect(tid(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');

    await expect(rail(page, 'top')).toHaveCount(13);
    const top = await rail(page, 'top').evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-rail-tool') ?? ''),
    );
    expect([...top].sort()).toEqual([...FLOOR_RAIL].sort());
    await expect(rail(page, 'bottom')).toHaveCount(2);
    const bottom = await rail(page, 'bottom').evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-rail-tool') ?? ''),
    );
    expect(bottom).toEqual(['assistant', 'help']);

    await expect(page.locator('[data-status-item]')).toHaveCount(6);
    for (const id of ['floor-control', 'status-phase', 'status-scale', 'status-snap', 'status-cursor', 'status-zoom'])
      await expect(tid(page, id), id).toHaveCount(1);

    for (const tab of ['layers', 'rooms', 'versions'])
      await expect(tid(page, `left-panel-tab-${tab}`), tab).toHaveCount(1);

    await expect
      .poll(() =>
        page.evaluate((names) => {
          const w = window as unknown as Record<string, Record<string, unknown> | undefined>;
          return Object.fromEntries(names.map((n) => [n, w[n] ? Object.keys(w[n]!).sort() : null]));
        }, Object.keys(HOOKS)),
      )
      .toEqual(HOOKS);

    // Section 2.6: the 3D hook arrives once the 3D view has opened.
    await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: '3D', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const h = (window as unknown as { __ezdraft3d?: Record<string, unknown> }).__ezdraft3d;
          return h ? Object.keys(h).sort() : null;
        }),
      )
      .toEqual(['stats']);
  });
});

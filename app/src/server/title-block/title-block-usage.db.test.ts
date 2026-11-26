// EZD-1991 (Q-0813; AC-EZD-1991-1, AC-EZD-1991-2; CLAUDE.md rule 4: no table or policy changed, and the count is
// read under the member's session so project RLS keeps it to their own company). Expected values: the S13 permit
// set, 9 sheets for a project, 10 with the "Reflected ceiling plan" box (lib/sheets/sheet-set.ts header; board S15b
// "Used on 10 sheets"); archived and benchmark projects are left out, as the Projects list leaves them out
// (vault/build/assumptions.md EZD-1991); Open Sheets opens the most recently changed project.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { loadTitleBlockUsage } from './title-block';

describe('EZD-1991 loadTitleBlockUsage', () => {
  let tenantA = '';
  let tenantB = '';
  let tenantEmpty = '';
  let ownerA: Session;
  let ownerB: Session;
  let ownerEmpty: Session;
  const ids: Record<string, string> = {};

  const project = async (
    tenant: string,
    key: string,
    o: { trades?: string[]; updated: string; archived?: boolean; benchmark?: boolean },
  ) => {
    const rows = await harnessSql()<{ id: string }[]>`
      insert into public.project (tenant_id, name, address, type, scope_trades, updated_at, archived_at, is_benchmark)
      values (${tenant}::uuid, ${`EZD-1991 ${key}`}, ${`${key} Usage St`}, 'kitchen', ${o.trades ?? []}::text[],
        ${o.updated}::timestamptz, ${o.archived ? harnessSql()`now()` : null}, ${o.benchmark ?? false})
      returning id`;
    ids[key] = rows[0].id;
  };

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    tenantEmpty = await createTenant();
    for (const [t, set] of [
      [tenantA, (s: Session) => (ownerA = s)],
      [tenantB, (s: Session) => (ownerB = s)],
      [tenantEmpty, (s: Session) => (ownerEmpty = s)],
    ] as const) {
      const m = await createMember({ tenantId: t, scope: 'all' });
      await setPermissions(t, m.membershipId, ['view_projects', 'settings_title_block']);
      set(await signIn(m.email));
    }
    // Company A: two live projects (9 + 10), one archived, one benchmark.
    await project(tenantA, 'A1', { updated: '2026-10-01T12:00:00Z' });
    await project(tenantA, 'A2', { trades: ['rcp', 'electrical'], updated: '2026-10-03T12:00:00Z' });
    await project(tenantA, 'A3', { trades: ['rcp'], updated: '2026-10-05T12:00:00Z', archived: true });
    await project(tenantA, 'A4', { updated: '2026-10-06T12:00:00Z', benchmark: true });
    // Company B: one live project, changed later than all of A's.
    await project(tenantB, 'B1', { trades: ['rcp'], updated: '2026-10-09T12:00:00Z' });
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('a company with no projects: 0 sheets and nothing to open', async () => {
    expect(await loadTitleBlockUsage(ownerEmpty.serverDb)).toEqual({ sheets: 0, projectId: null });
  });

  it('a company with one project: that project, 10 sheets with the reflected ceiling plan', async () => {
    expect(await loadTitleBlockUsage(ownerB.serverDb)).toEqual({ sheets: 10, projectId: ids.B1 });
  });

  it("several projects: 9 + 10, archived and benchmark left out, never another company's", async () => {
    expect(await loadTitleBlockUsage(ownerA.serverDb)).toEqual({ sheets: 19, projectId: ids.A2 });
  });

  it('a project changed later becomes the one Open Sheets opens', async () => {
    await harnessSql()`update public.project set scope_trades = '{rcp}' where id = ${ids.A1}::uuid`;
    // The update trigger stamps updated_at now; A1 now has the reflected ceiling plan too.
    expect(await loadTitleBlockUsage(ownerA.serverDb)).toEqual({ sheets: 20, projectId: ids.A1 });
  });
});

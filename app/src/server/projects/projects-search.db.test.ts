// EZD-117b D1 (vault/plans/EZD-117b.md section 4; AC-EZD-117b-1). Expected values: fixture H
// (app/test-harness/projects-search-fixture.ts); Decided "Search match" (trimmed, case-insensitive substring of
// project name, address or client name; `%`, `_` and `\` literal; empty or null = no filter); Q-0202 (a listed
// member sees only listed projects). The functions are called as the signed-in member (RLS applies), straight
// through the gated client, so the SQL is checked apart from the TypeScript wrapper.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedFixtureH, type HKey } from '../../../test-harness/projects-search-fixture';
import { ownerMember, listedViewer } from '../../../test-harness/projects-search-fixture';
import {
  cleanup,
  closeHarness,
  createTenant,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';

type Rpc = (
  fn: string,
  args?: object,
) => Promise<{ data: unknown; error: { message: string } | null }>;

describe('EZD-117b list and count projects with a search', () => {
  let owner: Session;
  let listed: Session;
  let H: Record<HKey, string>;

  async function names(s: Session, args: object): Promise<string[]> {
    const { data, error } = await (s.serverDb as unknown as { rpc: Rpc }).rpc(
      'list_projects',
      args,
    );
    expect(error).toBeNull();
    return (data as { items: { name: string }[] }).items.map((i) => i.name);
  }
  async function counts(s: Session, args?: object): Promise<unknown> {
    const { data, error } = await (s.serverDb as unknown as { rpc: Rpc }).rpc(
      'count_projects',
      args,
    );
    expect(error).toBeNull();
    return data;
  }

  beforeAll(async () => {
    const tenant = await createTenant();
    H = await seedFixtureH(tenant);
    owner = await signIn((await ownerMember(tenant)).email);
    listed = await signIn((await listedViewer(tenant, [H.laundry])).email);
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it(`EZD-117b done when: Search filters by client, address or project name, ignoring case, combines with the active status tab, and the tab counts follow the search (Q-0402). (D1)`, async () => {
    expect(await names(owner, { p_sort: 'edited', p_search: 'HENDRICKS' })).toEqual([
      'Kitchen remodel',
      'Primary bath',
    ]);
    expect(await counts(owner, { p_search: 'hendricks' })).toEqual({
      all: 2,
      draft: 1,
      client_review: 1,
      permit_submitted: 0,
      approved: 0,
      in_build: 0,
    });
    expect(await counts(owner, { p_search: 'bath' })).toEqual({
      all: 3,
      draft: 1,
      client_review: 1,
      permit_submitted: 0,
      approved: 1,
      in_build: 0,
    });
    expect(
      await names(owner, { p_sort: 'edited', p_status: 'draft', p_search: 'hendricks' }),
    ).toEqual(['Kitchen remodel']);
    expect(await names(owner, { p_sort: 'edited', p_search: '%' })).toEqual([]);
    expect(await names(owner, { p_sort: 'edited', p_search: 'oak lane' })).toEqual(['Guest bath']);
    expect(await names(owner, { p_sort: 'edited', p_search: '' })).toHaveLength(5);
    expect(await names(owner, { p_sort: 'edited', p_search: null })).toHaveLength(5);

    expect(await names(listed, { p_sort: 'edited', p_search: 'bath' })).toEqual([]);
    expect(await counts(listed, { p_search: 'bath' })).toEqual({
      all: 0,
      draft: 0,
      client_review: 0,
      permit_submitted: 0,
      approved: 0,
      in_build: 0,
    });
  });
});

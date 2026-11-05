// EZD-117b U4 (vault/plans/EZD-117b.md section 4; AC-EZD-117b-1). Expected values: Decided "parseProjectSearch"
// (`(params.get('q') ?? '').trim()`; longer than PROJECT_SEARCH_MAX = 1000 gives null) and "RPC args"
// (p_search only when non-empty; `client.rpc('count_projects')` with one argument when empty). Mocked client.
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../db/database.types';
import { countProjects, listProjects, parseProjectSearch } from './projects';

const q = { tab: 'all', sort: 'edited', after: null } as const;
const COUNTS = {
  all: 0,
  draft: 0,
  client_review: 0,
  permit_submitted: 0,
  approved: 0,
  in_build: 0,
};

function mockClient() {
  const rpc = vi.fn(async (fn: string) => ({
    data: fn === 'list_projects' ? { items: [], next: null } : COUNTS,
    error: null,
  }));
  return { rpc, client: { rpc } as unknown as SupabaseClient<Database> };
}

describe('EZD-117b project search on the server', () => {
  it('U4 parseProjectSearch trims and caps at 1000; the rpc args carry p_search only when non-empty', async () => {
    const p = (s: string) => new URLSearchParams(s);
    expect(parseProjectSearch(p('q=%20Oak%20'))).toBe('Oak');
    expect(parseProjectSearch(p(''))).toBe('');
    expect(parseProjectSearch(p(`q=${'a'.repeat(1000)}`))).toBe('a'.repeat(1000));
    expect(parseProjectSearch(p(`q=${'a'.repeat(1001)}`))).toBeNull();

    const a = mockClient();
    await listProjects(a.client, q, 'oak');
    expect(a.rpc.mock.calls[0][0]).toBe('list_projects');
    expect((a.rpc.mock.calls[0] as unknown[])[1]).toMatchObject({
      p_sort: 'edited',
      p_search: 'oak',
    });

    const b = mockClient();
    await listProjects(b.client, q);
    expect(b.rpc.mock.calls[0][0]).toBe('list_projects');
    expect('p_search' in ((b.rpc.mock.calls[0] as unknown[])[1] as object)).toBe(false);

    const c = mockClient();
    await countProjects(c.client, 'oak');
    expect(c.rpc).toHaveBeenCalledWith('count_projects', { p_search: 'oak' });

    const d = mockClient();
    await countProjects(d.client);
    expect(d.rpc).toHaveBeenCalledWith('count_projects');
    expect(d.rpc.mock.calls[0]).toHaveLength(1);
  });
});

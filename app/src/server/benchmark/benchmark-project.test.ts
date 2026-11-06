// EZD-236 U1-U3 (vault/plans/EZD-236.md section 4; AC-EZD-236-1). A fake client records `rpc`; no database.
// Expected values: Decided "`benchmarkChanges`" (exact key set, `base_seq` 0, `deleted` false, generator order)
// and "`ensureBenchmarkProject`" steps (2) to (5) (one rpc; 42501 and P0002 refuse; any other error is thrown;
// the reply is strict `{ project_id: uuid, created: boolean }`).
import { generateBenchmarkModel } from '@ezdraft/geometry';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { Database } from '../db/database.types';
import { benchmarkChanges, ensureBenchmarkProject } from './benchmark-project';

const V4 = '3f2b8c1e-5d4a-4c7e-9b1a-0e6d2f4a8c10';

type Reply = { data: unknown; error: { code: string; message: string } | null };

function fake(reply: Reply) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return reply;
    },
  } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

describe('EZD-236 benchmark project (server)', () => {
  it('EZD-236 U1 changes and call: one rpc with 3,000 changes in generator order', async () => {
    const { client, calls } = fake({ data: { project_id: V4, created: true }, error: null });
    const result = await ensureBenchmarkProject(client);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.fn).toBe('create_benchmark_project');
    const sent = (calls[0]!.args as { p_changes: Record<string, unknown>[] }).p_changes;
    const objects = generateBenchmarkModel();
    expect(sent).toHaveLength(3000);
    sent.forEach((c, i) => {
      expect(Object.keys(c).sort()).toEqual([
        'base_seq',
        'data',
        'deleted',
        'id',
        'schema_version',
        'type',
      ]);
      expect(c.base_seq).toBe(0);
      expect(c.deleted).toBe(false);
      expect(c.id).toBe(objects[i]!.id);
    });
    expect(benchmarkChanges(objects).map((c) => c.id)).toEqual(objects.map((o) => o.id));
    expect(result).toEqual({ ok: true, projectId: V4, created: true });
  });

  it('EZD-236 U2 refusals: 42501 and P0002 are permission_denied, any other error is thrown', async () => {
    for (const code of ['42501', 'P0002']) {
      const { client } = fake({ data: null, error: { code, message: 'x' } });
      expect(await ensureBenchmarkProject(client)).toEqual({
        ok: false,
        code: 'permission_denied',
      });
    }
    const other = { code: '22023', message: 'x' };
    const { client } = fake({ data: null, error: other });
    await expect(ensureBenchmarkProject(client)).rejects.toBe(other);
  });

  it('EZD-236 U3 bad reply: a non-uuid id and an extra key both reject benchmark_project_bad_reply', async () => {
    for (const data of [
      { project_id: 'x', created: true },
      { project_id: V4, created: true, extra: 1 },
    ]) {
      const { client } = fake({ data, error: null });
      await expect(ensureBenchmarkProject(client)).rejects.toThrow('benchmark_project_bad_reply');
    }
  });
});

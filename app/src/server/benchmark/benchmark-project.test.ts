// EZD-236 U1-U3 (vault/plans/EZD-236.md section 4; AC-EZD-236-1). A fake client records `rpc`; no database.
// Expected values: Decided "`benchmarkChanges`" (exact key set, `base_seq` 0, `deleted` false, generator order)
// and "`ensureBenchmarkProject`" steps (2) to (5) (one rpc; 42501 and P0002 refuse; any other error is thrown;
// the reply is strict `{ project_id: uuid, created: boolean }`).
// EZD-2016 U4-U9 (AC-EZD-2016-1, AC-EZD-2016-2; flaky-test audit 2026-11-27 row 9): the 3,000 objects go in batches. Expected
// values: the signed-in role's statement limit is 8 s (`statement_timeout=8s` on `authenticated`); 3,000 objects
// (BENCHMARK_OBJECT_COUNT) in batches of 250 are 12 statements; save_objects replies `saved`, `conflict` with
// `conflicts[].object_id`, or `stale_lock_epoch` (P120a M4).
import { generateBenchmarkModel } from '@ezdraft/geometry/benchmark';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { Database } from '../db/database.types';
import {
  BENCHMARK_BATCH_SIZE,
  benchmarkBatches,
  benchmarkChanges,
  ensureBenchmarkProject,
} from './benchmark-project';

const V4 = '3f2b8c1e-5d4a-4c7e-9b1a-0e6d2f4a8c10';

type Reply = { data: unknown; error: { code: string; message: string } | null };

function fake(reply: Reply) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      // EZD-2016: the batches after the first go through save_objects.
      if (fn === 'save_objects') return { data: { status: 'saved' }, error: null };
      return reply;
    },
  } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

describe('EZD-236 benchmark project (server)', () => {
  it('EZD-236 U1 changes and call: 3,000 changes in generator order, the first batch with the create call', async () => {
    const { client, calls } = fake({ data: { project_id: V4, created: true }, error: null });
    const result = await ensureBenchmarkProject(client);
    expect(calls[0]!.fn).toBe('create_benchmark_project');
    const sent = calls.flatMap((c) => (c.args as { p_changes: Record<string, unknown>[] }).p_changes);
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

  // EZD-2016 (AC-EZD-2016-2). A stand-in database that is busy: every object in a statement costs 3 ms, and a statement that
  // would run past the signed-in role's 8 s limit is canceled, as Postgres does (57014).
  const LIMIT_MS = 8000;
  const MS_PER_OBJECT = 3;
  const TIMEOUT = { code: '57014', message: 'canceling statement due to statement timeout' };

  type Step = { data: unknown; error: { code: string; message: string } | null };

  function busy(
    options: {
      created?: boolean;
      lastObjectThere?: boolean;
      save?: (n: number, changes: { id: string }[]) => Step | undefined;
    } = {},
  ) {
    const statements: { fn: string; ids: string[]; ms: number }[] = [];
    const reads: { table: string; filters: Record<string, string> }[] = [];
    let saves = 0;
    const client = {
      rpc: async (fn: string, args: { p_changes: { id: string }[] }): Promise<Step> => {
        const ms = args.p_changes.length * MS_PER_OBJECT;
        statements.push({ fn, ids: args.p_changes.map((c) => c.id), ms });
        if (ms > LIMIT_MS) return { data: null, error: TIMEOUT };
        if (fn === 'create_benchmark_project')
          return { data: { project_id: V4, created: options.created ?? true }, error: null };
        saves += 1;
        return options.save?.(saves, args.p_changes) ?? { data: { status: 'saved' }, error: null };
      },
      from: (table: string) => {
        const filters: Record<string, string> = {};
        const q = {
          select: () => q,
          eq: (column: string, value: string) => {
            filters[column] = value;
            return q;
          },
          maybeSingle: async () => {
            reads.push({ table, filters });
            return {
              data: options.lastObjectThere ? { object_id: filters.object_id } : null,
              error: null,
            };
          },
        };
        return q;
      },
    } as unknown as SupabaseClient<Database>;
    return { client, statements, reads };
  }

  it('EZD-2016 U4 batches: on a busy database one 3,000-object statement is canceled; 12 statements of 250 all finish well inside the limit', async () => {
    const all = benchmarkChanges(generateBenchmarkModel());
    expect(all).toHaveLength(3000);

    // The old shape, one statement: 3,000 x 3 ms = 9 s, past the 8 s limit.
    const old = busy();
    const refused = await old.client.rpc('create_benchmark_project', { p_changes: all as never });
    expect(refused.error).toEqual(TIMEOUT);

    const { client, statements } = busy();
    expect(await ensureBenchmarkProject(client)).toEqual({ ok: true, projectId: V4, created: true });
    expect(BENCHMARK_BATCH_SIZE).toBe(250);
    expect(statements).toHaveLength(12);
    expect(statements.map((s) => s.fn)).toEqual([
      'create_benchmark_project',
      ...Array.from({ length: 11 }, () => 'save_objects'),
    ]);
    for (const s of statements) {
      expect(s.ids).toHaveLength(250);
      // 250 x 3 ms = 750 ms: under a tenth of the 8 s limit.
      expect(s.ms).toBe(750);
      expect(s.ms).toBeLessThan(LIMIT_MS / 10);
    }
    expect(statements.flatMap((s) => s.ids)).toEqual(all.map((c) => c.id));
    // The two floors every other object names are in the statement that makes the project.
    expect(statements[0]!.ids.slice(0, 2)).toEqual([all[0]!.id, all[1]!.id]);
    expect(all.slice(0, 2).map((c) => c.type)).toEqual(['floor', 'floor']);
  });

  it('EZD-2016 U4 batches: benchmarkBatches keeps order, fills every batch but the last, and refuses a size under 1', () => {
    const all = benchmarkChanges(generateBenchmarkModel());
    const sevens = benchmarkBatches(all.slice(0, 20), 7);
    expect(sevens.map((b) => b.length)).toEqual([7, 7, 6]);
    expect(sevens.flat().map((c) => c.id)).toEqual(all.slice(0, 20).map((c) => c.id));
    expect(benchmarkBatches([], 7)).toEqual([]);
    expect(() => benchmarkBatches(all, 0)).toThrow('benchmark_batch_size_invalid');
  });

  it('EZD-2016 U5 save call: each later batch is save_objects on the new project at lock epoch 0', async () => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const client = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return fn === 'create_benchmark_project'
          ? { data: { project_id: V4, created: true }, error: null }
          : { data: { status: 'saved', tenant_id: V4, objects: [] }, error: null };
      },
    } as unknown as SupabaseClient<Database>;
    await ensureBenchmarkProject(client);
    expect(Object.keys(calls[0]!.args)).toEqual(['p_changes']);
    for (const c of calls.slice(1)) {
      expect(c.fn).toBe('save_objects');
      expect(Object.keys(c.args).sort()).toEqual(['p_changes', 'p_lock_epoch', 'p_project']);
      expect(c.args.p_project).toBe(V4);
      expect(c.args.p_lock_epoch).toBe(0);
    }
  });

  it('EZD-2016 U6 existing project: complete is left alone (one statement); part-written is finished by the 11 later batches', async () => {
    const all = benchmarkChanges(generateBenchmarkModel());
    const done = busy({ created: false, lastObjectThere: true });
    expect(await ensureBenchmarkProject(done.client)).toEqual({
      ok: true,
      projectId: V4,
      created: false,
    });
    expect(done.statements.map((s) => s.fn)).toEqual(['create_benchmark_project']);
    expect(done.reads).toEqual([
      { table: 'model_object', filters: { project_id: V4, object_id: all[2999]!.id } },
    ]);

    const part = busy({ created: false, lastObjectThere: false });
    expect(await ensureBenchmarkProject(part.client)).toEqual({
      ok: true,
      projectId: V4,
      created: false,
    });
    expect(part.statements).toHaveLength(12);
    expect(part.statements.slice(1).flatMap((s) => s.ids)).toEqual(all.slice(250).map((c) => c.id));
  });

  it('EZD-2016 U7 conflicts: objects another call already wrote are left as they are, the rest of the batch is sent once more', async () => {
    const all = benchmarkChanges(generateBenchmarkModel());
    const conflicts = (ids: string[]): Step => ({
      data: { status: 'conflict', conflicts: ids.map((id) => ({ object_id: id, server_seq: 1 })) },
      error: null,
    });
    // Save 1 (batch 2): every object is there already. Save 2 (batch 3): the first 100 are there.
    const { client, statements } = busy({
      created: false,
      save: (n, changes) =>
        n === 1
          ? conflicts(changes.map((c) => c.id))
          : n === 2
            ? conflicts(changes.slice(0, 100).map((c) => c.id.toUpperCase()))
            : undefined,
    });
    expect(await ensureBenchmarkProject(client)).toEqual({ ok: true, projectId: V4, created: false });
    expect(statements).toHaveLength(13);
    expect(statements[2]!.ids).toEqual(all.slice(500, 750).map((c) => c.id));
    expect(statements[3]!.ids).toEqual(all.slice(600, 750).map((c) => c.id));
    expect(statements[4]!.ids).toEqual(all.slice(750, 1000).map((c) => c.id));

    // A batch that still conflicts after the one resend is an error, not a loop.
    const stuck = busy({ save: (_n, changes) => conflicts([changes[0]!.id]) });
    await expect(ensureBenchmarkProject(stuck.client)).rejects.toThrow('benchmark_write_failed');
    expect(stuck.statements).toHaveLength(3);
  });

  it('EZD-2016 U8 failures in a later batch: a stale lock epoch and an unknown reply reject benchmark_write_failed, a database error is thrown as it is', async () => {
    for (const data of [{ status: 'stale_lock_epoch' }, { status: 'other' }, null]) {
      const { client, statements } = busy({ save: (n) => (n === 2 ? { data, error: null } : undefined) });
      await expect(ensureBenchmarkProject(client)).rejects.toThrow('benchmark_write_failed');
      expect(statements).toHaveLength(3);
    }
    const { client } = busy({ save: (n) => (n === 3 ? { data: null, error: TIMEOUT } : undefined) });
    await expect(ensureBenchmarkProject(client)).rejects.toBe(TIMEOUT);
  });

  it('EZD-2016 U9 refusals in a later batch: permission_denied for the project this call made; an existing project is returned as it is', async () => {
    for (const code of ['42501', 'P0002']) {
      const refuse = (): Step => ({ data: null, error: { code, message: 'x' } });
      const made = busy({ save: refuse });
      expect(await ensureBenchmarkProject(made.client)).toEqual({
        ok: false,
        code: 'permission_denied',
      });
      expect(made.statements).toHaveLength(2);
      const existing = busy({ created: false, save: refuse });
      expect(await ensureBenchmarkProject(existing.client)).toEqual({
        ok: true,
        projectId: V4,
        created: false,
      });
      expect(existing.statements).toHaveLength(2);
    }
  });
});

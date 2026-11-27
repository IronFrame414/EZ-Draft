// EZD-2016 D1-D4 (AC-EZD-2016-1, AC-EZD-2016-2; flaky-test audit 2026-11-27 row 9) on the local stack: ensureBenchmarkProject
// writes the benchmark model in batches, each its own database statement, and the project ends up the same.
// Expected values: 3,000 objects, floor 2 / wall 1516 / opening 762 / room 720 (BENCHMARK_MIX, EZD-236 D1); every
// row at updated_seq 1 (each object is written once); 3,000 objects in batches of 250 are 12 statements, the
// first through create_benchmark_project and 11 through save_objects.
// Calls go through the gated serverDb of `signIn` (RLS applies); rows are read with harnessSql.
import { generateBenchmarkModel } from '@ezdraft/geometry/benchmark';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
} from '../../../test-harness/rls/fixtures';
import type { Database } from '../db/database.types';
import { benchmarkBatches, benchmarkChanges, ensureBenchmarkProject } from './benchmark-project';

const T = { timeout: 60_000 };
const FULL = ['view_projects', 'edit_model', 'settings_system_status'];

type Statement = { fn: string; objects: number };

/** The session client, with every rpc it sends written down. */
function recording(db: SupabaseClient): { client: SupabaseClient<Database>; statements: Statement[] } {
  const statements: Statement[] = [];
  const client = new Proxy(db, {
    get(target, key) {
      if (key !== 'rpc') {
        const value = Reflect.get(target, key, target) as unknown;
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return (fn: string, args: { p_changes: unknown[] }) => {
        statements.push({ fn, objects: args.p_changes.length });
        return target.rpc(fn, args);
      };
    },
  }) as unknown as SupabaseClient<Database>;
  return { client, statements };
}

async function fixture() {
  const tenant = await createTenant();
  const owner = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, owner.membershipId, FULL as never);
  const s = await signIn(owner.email);
  return { tenant, owner, db: s.serverDb };
}

async function rows(projectId: string) {
  const sql = harnessSql();
  const byType = await sql<{ type: string; n: string }[]>`
    select type, count(*)::text as n from public.model_object
    where project_id = ${projectId}::uuid and not deleted group by type`;
  const [agg] = await sql<{ n: string; seqs: string[]; by: string[] }[]>`
    select count(*)::text as n, array_agg(distinct updated_seq::text) as seqs,
      array_agg(distinct updated_by::text) as by
    from public.model_object where project_id = ${projectId}::uuid`;
  return {
    mix: Object.fromEntries(byType.map((r) => [r.type, Number(r.n)])),
    total: Number(agg!.n),
    seqs: agg!.seqs,
    by: agg!.by,
  };
}

const MIX = { floor: 2, wall: 1516, opening: 762, room: 720 };

describe('EZD-2016 benchmark project in batches (database)', () => {
  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('EZD-2016 D1 a new project: 12 statements of 250 objects, and the same 3,000 rows as before', T, async () => {
    const f = await fixture();
    const { client, statements } = recording(f.db);
    const result = await ensureBenchmarkProject(client);
    expect(result).toMatchObject({ ok: true, created: true });
    if (!result.ok) return;
    expect(statements).toEqual([
      { fn: 'create_benchmark_project', objects: 250 },
      ...Array.from({ length: 11 }, () => ({ fn: 'save_objects', objects: 250 })),
    ]);
    const r = await rows(result.projectId);
    expect(r.mix).toEqual(MIX);
    expect(r.total).toBe(3000);
    expect(r.seqs).toEqual(['1']);
    expect(r.by).toEqual([f.owner.appUserId]);
    const ids = await harnessSql()<{ object_id: string }[]>`
      select object_id from public.model_object where project_id = ${result.projectId}::uuid order by object_id`;
    expect(ids.map((i) => i.object_id)).toEqual(
      generateBenchmarkModel()
        .map((o) => o.id)
        .sort(),
    );
  });

  it('EZD-2016 D2 a second call: one statement, same project, rows untouched', T, async () => {
    const f = await fixture();
    const first = await ensureBenchmarkProject(f.db as SupabaseClient<Database>);
    const { client, statements } = recording(f.db);
    const second = await ensureBenchmarkProject(client);
    expect(first).toMatchObject({ ok: true, created: true });
    if (!first.ok) return;
    expect(second).toEqual({ ok: true, projectId: first.projectId, created: false });
    expect(statements).toEqual([{ fn: 'create_benchmark_project', objects: 250 }]);
    const r = await rows(first.projectId);
    expect(r.mix).toEqual(MIX);
    expect(r.total).toBe(3000);
    expect(r.seqs).toEqual(['1']);
  });

  it('EZD-2016 D3 a part-written project (the call stopped after 3 of 12 batches) is finished by the next call', T, async () => {
    const f = await fixture();
    const batches = benchmarkBatches(benchmarkChanges(generateBenchmarkModel()));
    const made = await f.db.rpc('create_benchmark_project', { p_changes: batches[0] });
    expect(made.error).toBeNull();
    const projectId = (made.data as { project_id: string }).project_id;
    for (const batch of batches.slice(1, 3)) {
      const saved = await f.db.rpc('save_objects', {
        p_project: projectId,
        p_lock_epoch: 0,
        p_changes: batch,
      });
      expect(saved.error).toBeNull();
      expect((saved.data as { status: string }).status).toBe('saved');
    }
    expect((await rows(projectId)).total).toBe(750);

    const { client, statements } = recording(f.db);
    const result = await ensureBenchmarkProject(client);
    expect(result).toEqual({ ok: true, projectId, created: false });
    // The create call, the 2 batches already there (answered as conflicts, nothing rewritten), the 9 missing ones.
    expect(statements).toHaveLength(12);
    const r = await rows(projectId);
    expect(r.mix).toEqual(MIX);
    expect(r.total).toBe(3000);
    expect(r.seqs).toEqual(['1']);
  });

  it('EZD-2016 D4 race: two calls at once make one project with 3,000 objects', T, async () => {
    const f = await fixture();
    const [a, b] = await Promise.all([
      ensureBenchmarkProject(f.db as SupabaseClient<Database>),
      ensureBenchmarkProject(f.db as SupabaseClient<Database>),
    ]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.projectId).toBe(b.projectId);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    const [p] = await harnessSql()<{ n: string }[]>`
      select count(*)::text as n from public.project where tenant_id = ${f.tenant}::uuid and is_benchmark`;
    expect(Number(p!.n)).toBe(1);
    const r = await rows(a.projectId);
    expect(r.mix).toEqual(MIX);
    expect(r.total).toBe(3000);
    expect(r.seqs).toEqual(['1']);
  });
});

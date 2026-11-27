// EZD-236 Build step 7 (vault/plans/EZD-236.md section 1 Decided "`benchmarkChanges`", "`ensureBenchmarkProject`";
// section 3; AC-EZD-236-1): makes the caller's tenant its benchmark project through the caller's session client
// (create_benchmark_project checks System status; save_objects inside it checks Edit model and scope).
// EZD-2016 (AC-EZD-2016-1; flaky-test audit 2026-11-27 row 9): the 3,000 objects are no longer written by one
// statement, which ran past the signed-in role's 8 s statement limit on a busy database. The first
// BENCHMARK_BATCH_SIZE objects (the two floors among them) go in with create_benchmark_project, which makes the
// project and that batch together or not at all; every later batch is its own save_objects call, in generator
// order. A project left part-written (a later batch failed, or another call is still writing) is finished by the
// next call: it is complete when the generator's last object is there.
// EZD-901a ("adds the 150,000-entity DXF to the benchmark project"): given the caller's app user id, the benchmark
// project also gets its reference drawing (server/references/benchmark-reference.ts), once per project.
import { parseModelDocument, type StoredObject } from '@ezdraft/geometry';
import { generateBenchmarkModel } from '@ezdraft/geometry/benchmark';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database, Json } from '../db/database.types';
import { attachBenchmarkReference } from '../references/benchmark-reference';

export type BenchmarkChange = {
  id: string;
  base_seq: 0;
  deleted: false;
  type: string;
  schema_version: number;
  data: unknown;
};

export type BenchmarkProjectResult =
  { ok: true; projectId: string; created: boolean } | { ok: false; code: 'permission_denied' };

export function benchmarkChanges(objects: readonly StoredObject[]): BenchmarkChange[] {
  return objects.map((o) => ({
    id: o.id,
    base_seq: 0,
    deleted: false,
    type: o.type,
    schema_version: o.schema_version,
    data: o.data,
  }));
}

const replySchema = z.strictObject({ project_id: z.uuid(), created: z.boolean() });

/** Objects per database statement (EZD-2016): 3,000 objects are 12 statements of 250. */
export const BENCHMARK_BATCH_SIZE = 250;

const savedSchema = z.union([
  z.looseObject({ status: z.literal('saved') }),
  z.looseObject({
    status: z.literal('conflict'),
    conflicts: z.array(z.looseObject({ object_id: z.uuid() })),
  }),
  z.looseObject({ status: z.literal('stale_lock_epoch') }),
]);

export function benchmarkBatches(
  changes: readonly BenchmarkChange[],
  size: number = BENCHMARK_BATCH_SIZE,
): BenchmarkChange[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error('benchmark_batch_size_invalid');
  const batches: BenchmarkChange[][] = [];
  for (let i = 0; i < changes.length; i += size) batches.push(changes.slice(i, i + size));
  return batches;
}

const refused = (error: { code?: string }) => error.code === '42501' || error.code === 'P0002';

/**
 * Writes one batch with save_objects (lock epoch 0: nobody has opened the project yet). Objects another call
 * already wrote come back as conflicts and are left as they are; the rest of the batch is sent once more.
 * Returns false when the database refuses the caller.
 */
async function saveBatch(
  client: SupabaseClient<Database>,
  projectId: string,
  batch: BenchmarkChange[],
): Promise<boolean> {
  let pending = batch;
  for (let attempt = 0; attempt < 2 && pending.length > 0; attempt++) {
    const { data, error } = await client.rpc('save_objects', {
      p_project: projectId,
      p_lock_epoch: 0,
      p_changes: pending as Json,
    });
    if (error) {
      if (refused(error)) return false;
      throw error;
    }
    const reply = savedSchema.safeParse(data);
    if (!reply.success || reply.data.status === 'stale_lock_epoch')
      throw new Error('benchmark_write_failed');
    if (reply.data.status === 'saved') return true;
    const there = new Set(reply.data.conflicts.map((c) => c.object_id.toLowerCase()));
    pending = pending.filter((c) => !there.has(c.id.toLowerCase()));
  }
  if (pending.length > 0) throw new Error('benchmark_write_failed');
  return true;
}

async function hasObject(
  client: SupabaseClient<Database>,
  projectId: string,
  objectId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from('model_object')
    .select('object_id')
    .eq('project_id', projectId)
    .eq('object_id', objectId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

export async function ensureBenchmarkProject(
  client: SupabaseClient<Database>,
  reference?: { appUserId: string; kick?: () => void },
): Promise<BenchmarkProjectResult> {
  const objects = generateBenchmarkModel();
  if (!parseModelDocument({ objects }).ok) throw new Error('benchmark_model_invalid');
  const [first, ...rest] = benchmarkBatches(benchmarkChanges(objects));
  const { data, error } = await client.rpc('create_benchmark_project', {
    p_changes: (first ?? []) as Json,
  });
  if (error) {
    if (refused(error)) return { ok: false, code: 'permission_denied' };
    throw error;
  }
  const reply = replySchema.safeParse(data);
  if (!reply.success) throw new Error('benchmark_project_bad_reply');
  const projectId = reply.data.project_id;
  const created = reply.data.created;

  // A project this call did not make is finished here only when its last object is missing.
  const last = objects[objects.length - 1];
  const fill = rest.length > 0 && (created || (last && !(await hasObject(client, projectId, last.id))));
  if (fill) {
    for (const batch of rest) {
      if (await saveBatch(client, projectId, batch)) continue;
      // The project this call made cannot be written by its maker: refused, as before. An existing project the
      // caller may not write is returned as it is, as before (EZD-236 "An existing benchmark project is
      // returned as is").
      if (created) return { ok: false, code: 'permission_denied' };
      break;
    }
  }
  if (reference) {
    await attachBenchmarkReference(
      client,
      { projectId, appUserId: reference.appUserId },
      reference.kick ? { kick: reference.kick } : {},
    );
  }
  return { ok: true, projectId, created };
}

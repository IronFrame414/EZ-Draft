// EZD-236 Build step 7 (vault/plans/EZD-236.md section 1 Decided "`benchmarkChanges`", "`ensureBenchmarkProject`";
// section 3; AC-EZD-236-1): makes the caller's tenant its benchmark project through the caller's session client
// (create_benchmark_project checks System status; save_objects inside it checks Edit model and scope).
import { generateBenchmarkModel, parseModelDocument, type StoredObject } from '@ezdraft/geometry';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database, Json } from '../db/database.types';

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

export async function ensureBenchmarkProject(
  client: SupabaseClient<Database>,
): Promise<BenchmarkProjectResult> {
  const objects = generateBenchmarkModel();
  if (!parseModelDocument({ objects }).ok) throw new Error('benchmark_model_invalid');
  const { data, error } = await client.rpc('create_benchmark_project', {
    p_changes: benchmarkChanges(objects) as Json,
  });
  if (error) {
    if (error.code === '42501' || error.code === 'P0002')
      return { ok: false, code: 'permission_denied' };
    throw error;
  }
  const reply = replySchema.safeParse(data);
  if (!reply.success) throw new Error('benchmark_project_bad_reply');
  return { ok: true, projectId: reply.data.project_id, created: reply.data.created };
}

// EZD-237 (vault/plans/EZD-237.md section 3 C3, Decided D-Server; Q-0664; AC-EZD-237-1, -2): writes one benchmark
// run and reads a page of the tenant's runs through the caller's session client (record_benchmark_run checks System
// status and Edit model, list_benchmark_runs checks System status). jsonb parameters go as objects (L-022).
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  BENCHMARK_PAGE_SIZE,
  benchmarkDeviceSchema,
  benchmarkResultsSchema,
  type BenchmarkRunInput,
  type BenchmarkRunPage,
} from '../../lib/benchmark/benchmark-run';
import type { Database, Json } from '../db/database.types';

export async function recordBenchmarkRun(
  client: SupabaseClient<Database>,
  input: BenchmarkRunInput,
): Promise<{ ok: true; id: string } | { ok: false; code: 'permission_denied' | 'invalid_input' }> {
  const { data, error } = await client.rpc('record_benchmark_run', {
    p_device: input.device as unknown as Json,
    p_app_version: input.appVersion,
    p_results: input.results as unknown as Json,
  });
  if (error) {
    if (error.code === '42501') return { ok: false, code: 'permission_denied' };
    if (error.code === '22023') return { ok: false, code: 'invalid_input' };
    throw error;
  }
  const id = z.uuid().safeParse(data);
  if (!id.success) throw new Error('benchmark_runs_bad_reply');
  return { ok: true, id: id.data };
}

const listReply = z.strictObject({
  total: z.number().int().min(0),
  rows: z.array(
    z.strictObject({
      id: z.uuid(),
      run_at: z.string(),
      device: benchmarkDeviceSchema,
      app_version: z.string().min(1).max(64),
      results: benchmarkResultsSchema,
    }),
  ),
});

export async function listBenchmarkRuns(
  client: SupabaseClient<Database>,
  page: number,
): Promise<{ ok: true; page: BenchmarkRunPage } | { ok: false; code: 'permission_denied' }> {
  const { data, error } = await client.rpc('list_benchmark_runs', { p_page: page });
  if (error) {
    if (error.code === '42501') return { ok: false, code: 'permission_denied' };
    throw error;
  }
  const reply = listReply.safeParse(data);
  if (!reply.success) throw new Error('benchmark_runs_bad_reply');
  return {
    ok: true,
    page: {
      rows: reply.data.rows.map((r) => ({
        id: r.id,
        runAt: r.run_at,
        device: r.device,
        appVersion: r.app_version,
        results: r.results,
      })),
      total: reply.data.total,
      page,
      pageSize: BENCHMARK_PAGE_SIZE,
    },
  };
}

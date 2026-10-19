import { createPublicDbClient } from './client';

export async function readHealth(): Promise<{ status: 'ok'; schema_version: string | null }> {
  const { data, error } = await createPublicDbClient().rpc('health');
  if (error) throw new Error('health rpc failed');
  if (!Array.isArray(data) || data.length !== 1) throw new Error('health rpc row count');
  const row = data[0];
  if (row.status !== 'ok') throw new Error('health status not ok');
  return { status: 'ok', schema_version: row.schema_version ?? null };
}

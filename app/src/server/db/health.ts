import { createPublicDbClient } from './client';

export const HEALTH_DB_TIMEOUT_MS = 3000;

export async function readHealth(): Promise<{ status: 'ok'; schema_version: string | null }> {
  const client = createPublicDbClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_DB_TIMEOUT_MS);
  const timedOut = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(new Error('health rpc timeout')), {
      once: true,
    });
  });
  try {
    const { data, error } = await Promise.race([
      client.rpc('health').abortSignal(controller.signal),
      timedOut,
    ]);
    if (error) throw new Error('health rpc failed');
    if (!Array.isArray(data) || data.length !== 1) throw new Error('health rpc row count');
    const row = data[0];
    if (row.status !== 'ok') throw new Error('health status not ok');
    return { status: 'ok', schema_version: row.schema_version ?? null };
  } finally {
    clearTimeout(timer);
  }
}

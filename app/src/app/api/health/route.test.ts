// EZD-004b T2, T3 (vault/plans/EZD-004b.md section 4). T2 runs against the local Supabase (global setup).
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

// EZD-169 (vault/plans/EZD-169.md E2; Q-0317 (a)): the 500 path now calls reportRouteFailure after() unawaited.
// The mock keeps that report from reaching the local database or the real fetch after this file's afterEach.
vi.mock('../../../server/errors/route-failure', () => ({
  reportRouteFailure: vi.fn(async () => {}),
}));
import { GET } from './route';

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..',
  'supabase',
  'migrations',
);
const newestMigration = readdirSync(migrationsDir)
  .filter((f) => /^\d{14}_.+\.sql$/.test(f))
  .map((f) => f.slice(0, 14))
  .sort()
  .at(-1);

const DB_UNAVAILABLE = { error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } };

async function expectUnavailable(res: Response) {
  expect(res.status).toBe(500);
  expect(res.headers.get('cache-control')).toContain('no-store');
  expect(await res.json()).toEqual(DB_UNAVAILABLE);
}

describe('EZD-004b GET /api/health', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('EZD-004b T2 health route reads the local database, done when', async () => {
    expect(newestMigration).toBeTruthy();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(await res.json()).toEqual({ status: 'ok', schema_version: newestMigration });
  });

  it('EZD-004b T3a health failure, address nothing listens on, done when', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:9');
    await expectUnavailable(await GET());
  });

  it('EZD-004b T3b health failure, address missing, done when', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', undefined);
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    vi.resetModules();
    const fresh = await import('./route');
    await expectUnavailable(await fresh.GET());
  });

  it('EZD-004b T3c health failure, address empty, done when', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    await expectUnavailable(await GET());
  });

  it('EZD-004b T3d health failure, publishable key missing, done when', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', undefined);
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    await expectUnavailable(await GET());
  });
});

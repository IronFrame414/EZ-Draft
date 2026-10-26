// EZD-164 U3, U4 (vault/plans/EZD-164.md section 4): the throwaway caching worker route.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { SW_OFFLINE_WORKER_SOURCE } from '../worker-source';

describe('EZD-164 sw-offline worker route', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('EZD-164 U3 worker script', async () => {
    vi.stubEnv('VERCEL_ENV', '');
    delete process.env.VERCEL_ENV;
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.text();
    expect(body).toBe(SW_OFFLINE_WORKER_SOURCE);
    for (const needle of [
      'ezd-spike-164',
      '/dev/sw-offline/',
      '/_next/static/',
      "addEventListener('fetch'",
      'skipWaiting',
      'clients.claim',
      'ignoreVary: true',
      'Response.error()',
    ]) {
      expect(body).toContain(needle);
    }
    expect(body).not.toContain('importScripts');
  });

  it('EZD-164 U4 worker in production', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    const res = GET();
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('');
  });
});

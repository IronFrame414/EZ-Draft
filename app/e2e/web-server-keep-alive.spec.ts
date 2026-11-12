// EZD-380 K1, K2 (vault/plans/EZD-380.md section 4; AC-EZD-380-1). The test web server keeps idle kept-alive connections open for an hour (playwright.config.ts --keepAliveTimeout), so a client that reuses one after 8 s gets an answer on the same socket. Untagged, so desktop only.
import http from 'node:http';
import { expect, test } from '../test-harness/e2e/test';

function getOnce(
  agent: http.Agent,
  url: URL,
): Promise<{ status: number; keepAlive: string | undefined; reused: boolean }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { agent }, (res) => {
      res.resume();
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          keepAlive: res.headers['keep-alive'] as string | undefined,
          reused: req.reusedSocket,
        }),
      );
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

test.describe('EZD-380 test web server keeps idle connections open', () => {
  test('EZD-380 K1 the test web server announces a one-hour keep-alive', async ({ baseURL }) => {
    expect(baseURL).toBeTruthy();
    const url = new URL('/api/health', baseURL);
    const agent = new http.Agent({ keepAlive: true });
    try {
      const r = await getOnce(agent, url);
      expect(r.status).toBe(200);
      expect(r.keepAlive).toBe('timeout=3600');
    } finally {
      agent.destroy();
    }
  });

  test('EZD-380 K2 a connection left idle for 8 seconds is reused', async ({ baseURL }) => {
    expect(baseURL).toBeTruthy();
    const url = new URL('/api/health', baseURL);
    const agent = new http.Agent({ keepAlive: true });
    try {
      const round1 = await Promise.all([1, 2, 3, 4].map(() => getOnce(agent, url)));
      await new Promise((r) => setTimeout(r, 8000));
      const round2 = await Promise.all([1, 2, 3, 4].map(() => getOnce(agent, url)));
      expect([...round1, ...round2].map((r) => r.status)).toEqual(Array(8).fill(200));
      expect(round2.map((r) => r.reused)).toEqual([true, true, true, true]);
    } finally {
      agent.destroy();
    }
  });
});

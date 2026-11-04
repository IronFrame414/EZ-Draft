// EZD-021 T14 (vault/plans/EZD-021.md section 4): the guard in browser tests. Runs in `desktop` only (untagged).
// (a) and (b) are expected failures: the auto fixture of the harness `test` fails a test whose page asked for a
// live host, or whose server log grew. (c) a same-origin request from the page passes. (b) points the fixture
// at its own log file (test.use), so the line it appends cannot fail tests that run beside it in other workers.
import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '../test-harness/e2e/test';

const ownLog = path.join(mkdtempSync(path.join(os.tmpdir(), 'ezd021-guard-')), 'net-guard.log');
writeFileSync(ownLog, '');

test.describe('EZD-021 net guard in browser tests', () => {
  test('EZD-021 T14 (a) a page request to a live host fails the test', async ({ page }) => {
    test.fail();
    await page.evaluate(() => fetch('https://api.anthropic.com/v1/messages').catch(() => 0));
  });

  test.describe('server log', () => {
    test.use({ netGuardLog: ownLog });

    test('EZD-021 T14 (b) a line in the server guard log fails the test', async () => {
      test.fail();
      appendFileSync(
        ownLog,
        JSON.stringify({ via: 'fetch', method: 'POST', host: 'api.openai.com', at: Date.now() }) +
          '\n',
      );
    });
  });

  test('EZD-021 T14 (c) a same-origin request from the page passes', async ({ page }) => {
    await page.goto('/sign-in');
    const status = await page.evaluate(async () => (await fetch('/api/health')).status);
    expect(status).toBe(200);
  });
});

test.describe('EZD-159 net guard blocks page WebSockets', () => {
  test('EZD-159 T7 a page WebSocket to a live host fails the test', async ({ page }) => {
    test.fail();
    await page.goto('/sign-in');
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const ws = new WebSocket('wss://api.anthropic.com/');
          ws.onclose = () => resolve(0);
          ws.onerror = () => resolve(0);
          setTimeout(() => resolve(0), 5000);
        }),
    );
  });

  test('EZD-159 T8 a page WebSocket to the local Realtime server opens', async ({ page }) => {
    const url =
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}`.replace('http', 'ws') +
      `/realtime/v1/websocket?apikey=${process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}&vsn=1.0.0`;
    expect(url).toMatch(
      /^ws:\/\/127\.0\.0\.1:\d+\/realtime\/v1\/websocket\?apikey=.+&vsn=1\.0\.0$/,
    );
    await page.goto('/sign-in');
    const result = await page.evaluate(
      (target) =>
        new Promise<string>((resolve) => {
          const ws = new WebSocket(target);
          const timer = setTimeout(() => resolve('timeout'), 10000);
          ws.onopen = () => {
            clearTimeout(timer);
            ws.close();
            resolve('open');
          };
          ws.onerror = () => {
            clearTimeout(timer);
            resolve('closed');
          };
          ws.onclose = () => {
            clearTimeout(timer);
            resolve('closed');
          };
        }),
      url,
    );
    expect(result).toBe('open');
  });
});

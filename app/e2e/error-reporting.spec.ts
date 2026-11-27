// EZD-024 T18 (vault/plans/EZD-024.md Tests; Steps 6-7; Re-validation V8): a browser error goes through the
// SDK, the tunnel and the Sentry stub. EZD-2020 (audit 2026-11-27 X3): a tunnel report is unverified, so it
// queues no owner email of its own, first time or repeat; it waits for the hourly digest the sweep sends
// (tunnel-digest.db.test.ts and monitoring/route.test.ts cover the digest; no sweep runs in browser tests).
// Untagged, so desktop only. The stub folders are shared with other specs (failing test jobs email
// owner@example.test too), so this test counts only what carries its NONCE. Browser tests never reach Sentry
// or Resend: the page may talk to 127.0.0.1:3000 only.
import {
  eventsIn,
  expect,
  readSentryStubOutboxDir,
  readStubOutboxDir,
  test,
} from '../test-harness/e2e/test';

const NONCE = Array.from({ length: 12 }, () =>
  String.fromCharCode(97 + Math.floor(Math.random() * 26)),
).join('');
const MESSAGE = 'EZD-024 browser ' + NONCE;

test.describe('EZD-024 browser error reporting', () => {
  test('EZD-024 T18 a thrown browser error reaches the Sentry stub and queues no owner email of its own; nor does a repeat', async ({
    page,
  }) => {
    const sentryDir = process.env.SENTRY_STUB_DIR as string;
    const emailDir = process.env.EMAIL_STUB_DIR as string;
    const hosts = new Set<string>();
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.protocol === 'http:' || url.protocol === 'https:') hosts.add(url.host);
    });
    const events = () =>
      eventsIn(readSentryStubOutboxDir(sentryDir)).filter(
        (e) => e.exception?.values?.[0]?.value === MESSAGE,
      );
    const emails = () =>
      readStubOutboxDir(emailDir).filter(
        (m) => m.subject.includes(NONCE) || m.text.includes(NONCE),
      );

    await page.goto('/dev/errors?nonce=' + NONCE);
    await page.getByTestId('throw').click();
    await expect.poll(() => events().length, { timeout: 10000 }).toBe(1);
    expect(events()[0].tags['ezd.source']).toBe('browser');
    await page.waitForTimeout(3000);
    expect(emails()).toHaveLength(0);

    await page.reload();
    await page.getByTestId('throw').click();
    await expect.poll(() => events().length, { timeout: 10000 }).toBe(2);
    await page.waitForTimeout(3000);
    expect(events()).toHaveLength(2);
    expect(emails()).toHaveLength(0);

    expect([...hosts]).toEqual([new URL(String(test.info().project.use.baseURL)).host]);
  });
});

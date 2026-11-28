// EZD-2014 (flaky-test audit 2026-11-27 row 7): waitForNewRawEmail finds the first new email to an address
// by message id, so a mail catcher whose clock is behind this machine's (Docker's clock under load) no
// longer hides a fresh email, and a slow catcher is waited for up to the limit. The catcher is a stub here:
// fetch is replaced, nothing is sent and the local stack is not used.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForNewRawEmail, waitForRawEmail } from './mail-catcher';

type Stored = { ID: string; To: { Address: string }[]; Created: string; Subject: string; Text: string };

const TO = 'ezd-2014-recovery@example.test';
const HOUR = 3_600_000;

let inbox: Stored[];
let searches: number;

const put = (id: string, created: Date, text = `text ${id}`): void => {
  inbox.push({
    ID: id,
    To: [{ Address: TO }],
    Created: created.toISOString(),
    Subject: `subject ${id}`,
    Text: text,
  });
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  inbox = [];
  searches = 0;
  vi.stubEnv('SUPABASE_MAIL_URL', 'http://mail-catcher.stub');
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.pathname === '/api/v1/search') {
      searches += 1;
      return json({ messages: inbox.map((m) => ({ ID: m.ID, To: m.To, Created: m.Created, Subject: m.Subject })) });
    }
    const id = url.pathname.replace('/api/v1/message/', '');
    const found = inbox.find((m) => m.ID === id);
    if (!found) return json({}, 404);
    return json({ Subject: found.Subject, Text: found.Text, HTML: `<p>${found.Text}</p>` });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('EZD-2014 (AC-EZD-2014-1, AC-EZD-2014-2) waitForNewRawEmail finds the new email by message id', () => {
  it('AC-EZD-2014-2 M1 a catcher clock one hour behind hides the email from the time filter, not from the id wait', async () => {
    const behind = () => new Date(Date.now() - HOUR);

    // The old way (password-sign-in.test.ts T7 before this ticket): the fresh email looks an hour old.
    const before = new Date();
    put('m-1', behind());
    await expect(waitForRawEmail(TO, { after: before, timeoutMs: 300 })).rejects.toThrow(
      'mail-catcher: no email within 300 ms',
    );

    // The new way: the same kind of email, sent inside the wait, is found by its id.
    const mail = await waitForNewRawEmail(TO, async () => put('m-2', behind(), 'reset requested'), 300);
    expect(mail).toEqual({
      subject: 'subject m-2',
      text: 'reset requested',
      html: '<p>reset requested</p>',
    });
  });

  it('M2 an email already there is not returned, whatever its time says', async () => {
    put('old', new Date(Date.now() + HOUR));
    const mail = await waitForNewRawEmail(TO, async () => put('new', new Date(Date.now() - HOUR)), 300);
    expect(mail.subject).toBe('subject new');
  });

  it('AC-EZD-2014-2 M3 a slow catcher is waited for: the email shows up after several looks', async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const mail = await waitForNewRawEmail(
      TO,
      async () => {
        timer = setTimeout(() => put('late', new Date(Date.now() - HOUR)), 500);
      },
      5000,
    );
    clearTimeout(timer);
    expect(mail.subject).toBe('subject late');
    // One look before the send, then at least two after it (200 ms apart) before the email at 500 ms.
    expect(searches).toBeGreaterThanOrEqual(4);
  });

  it('M4 the first new email is returned when two arrive', async () => {
    const mail = await waitForNewRawEmail(
      TO,
      async () => {
        put('first', new Date(Date.now() - HOUR));
        put('second', new Date(Date.now() - HOUR + 1000));
      },
      300,
    );
    expect(mail.subject).toBe('subject first');
  });

  it('M5 it fails with the same message when no email comes, and the default limit is 10 s', async () => {
    await expect(waitForNewRawEmail(TO, async () => {}, 300)).rejects.toThrow(
      'mail-catcher: no email within 300 ms',
    );

    vi.useFakeTimers();
    try {
      const started = Date.now();
      const failed = expect(waitForNewRawEmail(TO, async () => {})).rejects.toThrow(
        'mail-catcher: no email within 10000 ms',
      );
      await vi.advanceTimersByTimeAsync(9_900);
      const looksBeforeLimit = searches;
      await vi.advanceTimersByTimeAsync(400);
      await failed;
      expect(Date.now() - started).toBeGreaterThanOrEqual(10_000);
      expect(looksBeforeLimit).toBeGreaterThan(40);
    } finally {
      vi.useRealTimers();
    }
  });
});

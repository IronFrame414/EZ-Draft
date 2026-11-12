// EZD-389 · sender copy (vault/plans/EZD-389.md section 4, T1-T14; AC-EZD-389-1, -2, -3). Expected values from
// the plan's sources (Q-0701; D1-D11; section 6), never from running the code.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types';
import type { captureToSentry } from '../errors/sentry';
import { clearStubOutbox, readStubOutbox } from './test-harness/stub-transport';
import { EmailInputError, sendEmail } from './send';
import type { EmailTransport, SendEmailInput } from './types';

const flag = vi.hoisted(() => ({ on: true }));
vi.mock('./sender-copy', () => ({ SENDER_COPY_ON: true, senderCopyOn: () => flag.on }));

const LINK = 'https://ezdraft.ezcontractorbinder.com/invite/AbC123?ref=email&x=1';
const TO = 'crew@example.test';
const FROM = 'EZ Draft Test <test@example.test>';
const ENV_STUB = { EMAIL_TRANSPORT: 'stub', EMAIL_FROM: FROM };
const CO = { name: 'Worth Properties', replyTo: 'office@example.test' };
const SENDER = 'josh@example.test';
const INPUT: SendEmailInput = {
  to: TO,
  sentBy: { email: SENDER },
  subject: 'Test subject',
  paragraphs: ['Line one', 'Line two'],
  link: { url: LINK, label: 'Open' },
};
const NOTE =
  "This is your copy of the email sent to crew@example.test. If they can't find it, ask them to check their spam folder, or forward this email to them.";

describe('EZD-389 sender copy', () => {
  beforeEach(() => {
    clearStubOutbox();
    flag.on = true;
  });

  afterEach(() => {
    vi.doUnmock('./transport');
    vi.doUnmock('../errors/sentry');
    vi.doUnmock('./send');
    vi.resetModules();
  });

  async function injected(impls: Array<'ok' | 'fail' | 'throw'>) {
    const transport = {
      name: 'stub' as const,
      send: vi.fn<EmailTransport['send']>(),
    };
    for (const k of impls) {
      if (k === 'ok') transport.send.mockResolvedValueOnce({ ok: true, messageId: 'm1' });
      else if (k === 'fail')
        transport.send.mockResolvedValueOnce({ ok: false, code: 'email_provider_error' });
      else transport.send.mockRejectedValueOnce(new Error('boom josh@example.test'));
    }
    const sentry = vi.fn<(error: Error, ctx: Parameters<typeof captureToSentry>[1]) => string | null>(() => null);
    vi.resetModules();
    vi.doMock('./transport', () => ({
      getEmailTransport: () => ({ ok: true, transport, from: FROM }),
    }));
    vi.doMock('../errors/sentry', () => ({ captureToSentry: sentry }));
    const { sendEmail: send } = await import('./send');
    return { transport, sentry, send };
  }

  async function spyOnSend() {
    const spy = vi.fn<typeof sendEmail>(async () => ({
      link: 'http://localhost:3000',
      status: 'sent',
      transport: 'stub',
      messageId: 'm',
      errorCode: null,
    }));
    vi.resetModules();
    vi.doMock('./send', async (orig) => ({
      ...(await orig<typeof import('./send')>()),
      sendEmail: spy,
    }));
    return spy;
  }

  it('T1 EZD-389 done when: an email a user sends reaches the recipient and a marked copy reaches the user', async () => {
    const r = await sendEmail(INPUT, { env: ENV_STUB });
    const box = readStubOutbox();
    expect(box.length).toBe(2);
    expect(box[0].to).toBe('crew@example.test');
    expect(box[0].from).toBe(FROM);
    expect(box[0].subject).toBe('Test subject');
    expect(box[0].text).toBe('Line one\n\nLine two\n\n' + LINK + '\n');
    expect(box[0]).not.toHaveProperty('replyTo');
    expect(box[1].to).toBe('josh@example.test');
    expect(box[1].from).toBe(FROM);
    expect(box[1].subject).toBe('Copy: Test subject');
    expect(box[1].text).toBe(NOTE + '\n\nLine one\n\nLine two\n\n' + LINK + '\n');
    expect(box[1]).not.toHaveProperty('replyTo');
    expect(r).toEqual({
      link: LINK,
      status: 'sent',
      transport: 'stub',
      messageId: box[0].id,
      errorCode: null,
    });
  });

  it('T2 the copy keeps the company sender, reply-to, link and language', async () => {
    await sendEmail({ ...INPUT, company: CO, lang: 'es' }, { env: ENV_STUB });
    const box = readStubOutbox();
    expect(box.length).toBe(2);
    expect(box[0].from).toBe('Worth Properties via EZ Draft <test@example.test>');
    expect(box[1].from).toBe(box[0].from);
    expect(box[0].replyTo).toBe('office@example.test');
    expect(box[1].replyTo).toBe('office@example.test');
    expect(box[1].html).toBe(
      box[0].html.replace(
        '<body>',
        '<body><p>This is your copy of the email sent to crew@example.test. If they can&#39;t find it, ask them to check their spam folder, or forward this email to them.</p>',
      ),
    );
    expect(box[1].html.startsWith('<!doctype html><html lang="es"><body>')).toBe(true);
  });

  it('T3 EZD-389 done when: an email with no acting user goes only to its recipient', async () => {
    const r = await sendEmail({ ...INPUT, sentBy: null }, { env: ENV_STUB });
    const box = readStubOutbox();
    expect(box.length).toBe(1);
    expect(box[0].to).toBe('crew@example.test');
    expect(r.status).toBe('sent');
    expect(r.messageId).toBe(box[0].id);
  });

  it('T4 no copy when the sender is the recipient, whatever the letter case', async () => {
    await sendEmail({ ...INPUT, sentBy: { email: 'Crew@Example.TEST' } }, { env: ENV_STUB });
    let box = readStubOutbox();
    expect(box.length).toBe(1);
    expect(box[0].to).toBe('crew@example.test');
    clearStubOutbox();
    await sendEmail(
      { ...INPUT, to: 'CREW@example.test', sentBy: { email: 'crew@example.test' } },
      { env: ENV_STUB },
    );
    box = readStubOutbox();
    expect(box.length).toBe(1);
    expect(box[0].to).toBe('CREW@example.test');
  });

  it('T5 EZD-389 done when: turning the switch off stops the copies', async () => {
    flag.on = false;
    await sendEmail(INPUT, { env: ENV_STUB });
    expect(readStubOutbox().length).toBe(1);
    expect(readStubOutbox()[0].to).toBe('crew@example.test');
    flag.on = true;
    await sendEmail({ ...INPUT, subject: 'Second' }, { env: ENV_STUB });
    const box = readStubOutbox();
    expect(box.length).toBe(3);
    expect(box[2].to).toBe('josh@example.test');
    expect(box[2].subject).toBe('Copy: Second');
  });

  it('T6 the switch is on in the repo', async () => {
    const real = await vi.importActual<typeof import('./sender-copy')>('./sender-copy');
    expect(real.SENDER_COPY_ON).toBe(true);
    expect(real.senderCopyOn()).toBe(true);
  });

  it('T7 a bad or missing sentBy refuses the call before any send', async () => {
    const errs = await Promise.all(
      [
        sendEmail({ ...INPUT, sentBy: { email: 'not-an-email' } }, { env: ENV_STUB }),
        sendEmail({ ...INPUT, sentBy: { email: ' josh@example.test' } }, { env: ENV_STUB }),
        sendEmail({ ...INPUT, sentBy: {} } as unknown as SendEmailInput, { env: ENV_STUB }),
        sendEmail(
          // @ts-expect-error sentBy is required (EZD-389 D3)
          { to: TO, subject: 'Test subject', paragraphs: [], link: { url: LINK, label: 'Open' } },
          { env: ENV_STUB },
        ),
      ].map((p) =>
        p.then(
          () => null,
          (e: unknown) => e,
        ),
      ),
    );
    for (const err of errs) {
      expect(err).toBeInstanceOf(EmailInputError);
      expect((err as EmailInputError).code).toBe('email_invalid_input');
    }
    expect(readStubOutbox().length).toBe(0);
  });

  it('T8 no copy when the recipient send fails', async () => {
    const { transport, sentry, send } = await injected(['fail']);
    const r = await send(INPUT);
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(r).toEqual({
      link: LINK,
      status: 'failed',
      transport: 'stub',
      messageId: null,
      errorCode: 'email_provider_error',
    });
    expect(sentry).toHaveBeenCalledTimes(1);
    expect(sentry.mock.calls[0][0].message).toBe('email_provider_error');
    expect(sentry.mock.calls[0][1]).toEqual({ source: 'function', location: 'email.send' });
  });

  it('T9 a failed copy leaves the result as sent and reports its code only', async () => {
    const { transport, sentry, send } = await injected(['ok', 'fail']);
    const r = await send(INPUT);
    expect(transport.send).toHaveBeenCalledTimes(2);
    expect(transport.send.mock.calls[1][0].to).toBe('josh@example.test');
    expect(transport.send.mock.calls[1][1]).toBeUndefined();
    expect(r).toEqual({
      link: LINK,
      status: 'sent',
      transport: 'stub',
      messageId: 'm1',
      errorCode: null,
    });
    expect(sentry).toHaveBeenCalledTimes(1);
    const [message, context] = sentry.mock.calls[0];
    expect(message.message).toBe('email_copy_failed');
    expect(context).toEqual({
      source: 'function',
      location: 'email.send.copy',
      tags: { 'ezd.cause': 'email_provider_error' },
    });
    const dump = JSON.stringify([message.message, context]);
    expect(dump).not.toContain('josh@example.test');
    expect(dump).not.toContain('crew@example.test');
    expect(dump).not.toContain('AbC123');
  });

  it('T10 a copy send that throws does not throw from sendEmail', async () => {
    const { sentry, send } = await injected(['ok', 'throw']);
    const r = await send(INPUT);
    expect(r).toEqual({
      link: LINK,
      status: 'sent',
      transport: 'stub',
      messageId: 'm1',
      errorCode: null,
    });
    expect(sentry).toHaveBeenCalledTimes(1);
    const [message, context] = sentry.mock.calls[0];
    expect(message.message).toBe('email_copy_failed');
    expect(context?.tags).toEqual({ 'ezd.cause': 'email_copy_threw' });
    const dump = JSON.stringify([message.message, context]);
    expect(dump).not.toContain('boom');
    expect(dump).not.toContain('josh@example.test');
  });

  it('T11 the copy carries its own idempotency key', async () => {
    const a = await sendEmail({ ...INPUT, idempotencyKey: 'k1' }, { env: ENV_STUB });
    const b = await sendEmail({ ...INPUT, idempotencyKey: 'k1' }, { env: ENV_STUB });
    let box = readStubOutbox();
    expect(box.length).toBe(2);
    expect(box[0].idempotencyKey).toBe('k1');
    expect(box[1].idempotencyKey).toBe('k1:copy');
    expect(a.messageId).toBe(box[0].id);
    expect(b.messageId).toBe(box[0].id);
    clearStubOutbox();
    await sendEmail(INPUT, { env: ENV_STUB });
    box = readStubOutbox();
    expect(box.length).toBe(2);
    expect(box[1].idempotencyKey).toBeNull();
  });

  it('T12 a subject holding braces is copied as it is', async () => {
    await sendEmail({ ...INPUT, subject: 'Plan {name} ready' }, { env: ENV_STUB });
    const box = readStubOutbox();
    expect(box[0].subject).toBe('Plan {name} ready');
    expect(box[1].subject).toBe('Copy: Plan {name} ready');
  });

  it('T13 the profile emails name the signed-in user as sender', async () => {
    const spy = await spyOnSend();
    await (await import('../profile/profile')).sendPasswordEmail('changed', TO, ENV_STUB);
    await (await import('../assistant/user-key')).sendAiKeyEmail('added', TO, '1234', ENV_STUB);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0][0].sentBy).toEqual({ email: 'crew@example.test' });
    expect(spy.mock.calls[1][0].sentBy).toEqual({ email: 'crew@example.test' });
    expect(spy.mock.calls[0][0].to).toBe('crew@example.test');
    expect(spy.mock.calls[1][0].to).toBe('crew@example.test');
  });

  it('T14 EZD-389 owner alerts have no acting user', async () => {
    const alertInput = {
      kind: 'error' as const,
      alertId: 'a1',
      claim: 'c1',
      params: {
        kind: 'error' as const,
        title: 'Error: probe',
        source: 'function' as const,
        location: '/api/x',
        eventId: null,
      },
      tenantId: null,
      db: { rpc: vi.fn() } as unknown as SupabaseClient<Database>,
      env: { ...ENV_STUB, ALERT_EMAIL_TO: 'owner@example.test' },
    };
    const real = await (await import('../errors/alert-email')).sendOwnerAlert(alertInput);
    expect(real).toBe('emailed');
    expect(readStubOutbox().length).toBe(1);
    expect(readStubOutbox()[0].to).toBe('owner@example.test');
    clearStubOutbox();

    const spy = await spyOnSend();
    await (await import('../errors/alert-email')).sendOwnerAlert(alertInput);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].sentBy).toBeNull();
  });
});

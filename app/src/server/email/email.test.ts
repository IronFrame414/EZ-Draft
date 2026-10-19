// EZD-008a · send helper and transports (vault/plans/EZD-008a.md section 4, T1-T10).
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStubOutbox, readStubOutbox } from './test-harness/stub-transport';
import { linksIn, readStubOutboxDir } from '../../../test-harness/email-outbox';
import { buildEmailBody } from './body';
import { getEmailTransport } from './transport';
import { createResendTransport } from './resend-transport';
import { EmailInputError, sendEmail } from './send';

const LINK = 'https://ezdraft.ezcontractorbinder.com/invite/AbC123?ref=email&x=1';
const TO = 'crew@example.test';
const FROM = 'EZ Draft Test <test@example.test>';
const ENV_STUB = { EMAIL_TRANSPORT: 'stub', EMAIL_FROM: FROM };
const INPUT = {
  to: TO,
  subject: 'Test subject',
  paragraphs: ['Line one', 'Line two'],
  link: { url: LINK, label: 'Open' },
};
const CO = { name: 'Worth Properties', replyTo: 'office@example.test' };

describe('EZD-008a send helper and transports', () => {
  beforeEach(() => {
    clearStubOutbox();
  });

  it('EZD-008a done when: stub records one message and returns the link in its body', async () => {
    const r = await sendEmail(INPUT, { env: ENV_STUB });
    expect(r.link).toBe(LINK);
    expect(r.status).toBe('sent');
    expect(r.transport).toBe('stub');
    expect(r.errorCode).toBeNull();
    expect(r.messageId?.startsWith('stub_')).toBe(true);
    const box = readStubOutbox();
    expect(box.length).toBe(1);
    const m = box[0];
    expect(m.to).toBe(TO);
    expect(m.from).toBe(FROM);
    expect(m.subject).toBe('Test subject');
    expect(linksIn(m).text).toEqual([LINK]);
    expect(linksIn(m).html).toEqual([LINK]);
    expect(r.link).toBe(linksIn(m).text[0]);
  });

  it('T2 body format and escaping', () => {
    const one = buildEmailBody({ paragraphs: INPUT.paragraphs, link: INPUT.link });
    expect(one.text).toBe('Line one\n\nLine two\n\n' + LINK + '\n');
    const href = 'href="https://ezdraft.ezcontractorbinder.com/invite/AbC123?ref=email&amp;x=1"';
    expect(one.html.split(href).length - 1).toBe(1);
    expect(one.html).not.toContain('&x=1');
    expect(one.html.startsWith('<!doctype html><html lang="en">')).toBe(true);

    const two = buildEmailBody({
      paragraphs: ['<script>x</script>'],
      link: { url: LINK, label: 'A & B' },
      lang: 'es',
    });
    expect(two.html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(two.html).not.toContain('<script>');
    expect(two.html).toContain('A &amp; B');
    expect(two.html.startsWith('<!doctype html><html lang="es">')).toBe(true);

    const three = buildEmailBody({ paragraphs: [], link: INPUT.link });
    expect(three.text).toBe(LINK + '\n');
  });

  describe('T3 transport choice', () => {
    const failing: [string, Record<string, string>, string][] = [
      ['(a)', {}, 'email_transport_not_set'],
      ['(b)', { EMAIL_TRANSPORT: 'smtp', EMAIL_FROM: FROM }, 'email_transport_not_set'],
      ['(c)', { EMAIL_TRANSPORT: 'stub' }, 'email_from_not_set'],
      ['(d)', { ...ENV_STUB, EMAIL_FROM: 'not an address' }, 'email_from_not_set'],
      ['(e)', { ...ENV_STUB, VERCEL_ENV: 'production' }, 'email_stub_not_allowed'],
      ['(f)', { EMAIL_TRANSPORT: 'resend', EMAIL_FROM: FROM }, 'email_key_not_set'],
    ];
    for (const [label, env, code] of failing) {
      it(`${label} fails with ${code}`, async () => {
        expect(getEmailTransport(env)).toEqual({ ok: false, code });
        const r = await sendEmail(INPUT, { env });
        expect(r.status).toBe('failed');
        expect(r.transport).toBeNull();
        expect(r.messageId).toBeNull();
        expect(r.link).toBe(LINK);
        expect(r.errorCode).toBe(code);
        expect(readStubOutbox().length).toBe(0);
      });
    }

    it('(g) preview with stub is ok', () => {
      const r = getEmailTransport({ ...ENV_STUB, VERCEL_ENV: 'preview' });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.transport.name).toBe('stub');
    });

    it('(h) preview with resend and a key is ok', () => {
      const r = getEmailTransport({
        EMAIL_TRANSPORT: 'resend',
        EMAIL_FROM: FROM,
        RESEND_API_KEY: 're_fake',
        VERCEL_ENV: 'preview',
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.transport.name).toBe('resend');
    });

    it('(i) bare address EMAIL_FROM is ok', () => {
      const r = getEmailTransport({ EMAIL_TRANSPORT: 'stub', EMAIL_FROM: 'x@example.test' });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.from).toBe('x@example.test');
    });
  });

  describe('T4 EZD-008a done when: the Resend transport sends the same message through a fake client', () => {
    afterEach(() => {
      vi.doUnmock('./transport');
      vi.resetModules();
    });

    async function viaResend(sendImpl: () => Promise<unknown>) {
      const fake = { emails: { send: vi.fn(sendImpl) } };
      vi.resetModules();
      const { createResendTransport: make } = await import('./resend-transport');
      const transport = make({
        apiKey: 're_fake',
        client: fake as unknown as Parameters<typeof make>[0]['client'],
      });
      vi.doMock('./transport', () => ({
        getEmailTransport: () => ({ ok: true, transport, from: FROM }),
      }));
      const { sendEmail: send } = await import('./send');
      const result = await send({ ...INPUT, company: CO, idempotencyKey: 'k1' });
      return { fake, result };
    }

    it('(a) success: same message as the stub record', async () => {
      await sendEmail({ ...INPUT, company: CO }, { env: ENV_STUB });
      const S = readStubOutbox()[0];
      expect(S.from).toBe('Worth Properties via EZ Draft <test@example.test>');
      const { fake, result } = await viaResend(async () => ({
        data: { id: 're_123' },
        error: null,
      }));
      expect(fake.emails.send).toHaveBeenCalledTimes(1);
      const [payload, opts] = fake.emails.send.mock.calls[0] as unknown as [
        Record<string, string>,
        unknown,
      ];
      expect(opts).toEqual({ idempotencyKey: 'k1' });
      expect(Object.keys(payload).sort()).toEqual(
        ['from', 'to', 'replyTo', 'subject', 'text', 'html'].sort(),
      );
      expect(payload.from).toBe(S.from);
      expect(payload.to).toBe(TO);
      expect(payload.replyTo).toBe(S.replyTo);
      expect(payload.replyTo).toBe('office@example.test');
      expect(payload.subject).toBe(S.subject);
      expect(payload.text).toBe(S.text);
      expect(payload.html).toBe(S.html);
      expect(result.status).toBe('sent');
      expect(result.messageId).toBe('re_123');
      expect(result.transport).toBe('resend');
    });

    it('(b) provider error result', async () => {
      const { result } = await viaResend(async () => ({
        data: null,
        error: { name: 'validation_error', message: 'x' },
      }));
      expect(result.status).toBe('failed');
      expect(result.errorCode).toBe('email_provider_error');
      expect(result.link).toBe(LINK);
    });

    it('(c) thrown error', async () => {
      const { result } = await viaResend(async () => {
        throw new Error('boom');
      });
      expect(result.status).toBe('failed');
      expect(result.errorCode).toBe('email_provider_error');
      expect(result.link).toBe(LINK);
    });
  });

  it('EZD-008a done when: without a fake client the Resend transport never reaches the network', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    try {
      const r = await createResendTransport({ apiKey: 're_fake' }).send({
        from: FROM,
        to: TO,
        subject: 's',
        text: 't',
        html: 'h',
      });
      expect(r).toEqual({ ok: false, code: 'email_live_blocked_in_tests' });
      expect(spy).toHaveBeenCalledTimes(0);
    } finally {
      spy.mockRestore();
    }
  });

  describe('T6 invalid input throws', () => {
    const cases: [string, Record<string, unknown>][] = [
      ['to not an email', { to: 'not-an-email' }],
      ['replyTo not an email', { company: { name: 'Worth Properties', replyTo: 'x' } }],
      ['blank company name', { company: { name: '  ', replyTo: null } }],
      ['company name only forbidden chars', { company: { name: '"<>', replyTo: null } }],
      ['empty subject', { subject: '' }],
      ['subject with line break', { subject: 'a\r\nBcc: x@example.test' }],
      ['javascript url', { link: { url: 'javascript:alert(1)', label: 'Open' } }],
      ['ftp url', { link: { url: 'ftp://x.test/a', label: 'Open' } }],
      ['relative url', { link: { url: '/invite/AbC123', label: 'Open' } }],
      ['empty label', { link: { url: LINK, label: '' } }],
    ];
    for (const [name, change] of cases) {
      it(name, async () => {
        const err = await sendEmail({ ...INPUT, ...change } as typeof INPUT, {
          env: ENV_STUB,
        }).then(
          () => null,
          (e: unknown) => e,
        );
        expect(err).toBeInstanceOf(EmailInputError);
        expect((err as EmailInputError).code).toBe('email_invalid_input');
        expect(readStubOutbox().length).toBe(0);
      });
    }
  });

  it('T7 stub file sink', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ezd-outbox-'));
    const env = { ...ENV_STUB, EMAIL_STUB_DIR: dir };
    await sendEmail({ ...INPUT, to: 'a@example.test' }, { env });
    await sendEmail({ ...INPUT, to: 'b@example.test' }, { env });
    const fromDir = readStubOutboxDir(dir);
    const mem = readStubOutbox();
    expect(fromDir.length).toBe(2);
    expect(fromDir[0].to).toBe('a@example.test');
    expect(fromDir[1].to).toBe('b@example.test');
    expect(fromDir[0]).toStrictEqual(mem[0]);
    expect(fromDir[1]).toStrictEqual(mem[1]);
    const files = readdirSync(dir);
    expect(files.length).toBe(2);
    for (const f of files) expect(f).toMatch(/^\d{13}-\d{6}-stub_[0-9a-f-]{36}\.json$/);
    expect(readStubOutboxDir(join(dir, 'missing'))).toEqual([]);
  });

  it('T8 stub idempotency', async () => {
    const a = await sendEmail({ ...INPUT, idempotencyKey: 'k1' }, { env: ENV_STUB });
    const b = await sendEmail({ ...INPUT, idempotencyKey: 'k1' }, { env: ENV_STUB });
    const c = await sendEmail({ ...INPUT, idempotencyKey: 'k2' }, { env: ENV_STUB });
    expect(readStubOutbox().length).toBe(2);
    expect(a.messageId).toBe(b.messageId);
    expect(c.messageId).not.toBe(a.messageId);
  });

  it('T9 test defaults', async () => {
    expect(process.env.EMAIL_TRANSPORT).toBe('stub');
    expect(process.env.EMAIL_FROM).toBe('EZ Draft Test <test@example.test>');
    const r = await sendEmail(INPUT);
    expect(r.status).toBe('sent');
    expect(r.transport).toBe('stub');
    expect(readStubOutbox().length).toBe(1);
  });

  describe('T10 sender rules', () => {
    const cases: [string, Record<string, unknown>, string, string | undefined][] = [
      ['(a) no company', {}, FROM, undefined],
      [
        '(b) company with reply address',
        { company: CO },
        'Worth Properties via EZ Draft <test@example.test>',
        'office@example.test',
      ],
      [
        '(c) company without reply address',
        { company: { name: 'Worth Properties', replyTo: null } },
        'Worth Properties via EZ Draft <test@example.test>',
        undefined,
      ],
      [
        '(d) injection characters removed',
        { company: { name: 'A "B" <c>\r\nBcc: x', replyTo: null } },
        '"A B cBcc: x via EZ Draft" <test@example.test>',
        undefined,
      ],
      [
        '(e) comma is quoted',
        { company: { name: 'Smith, Jones LLC', replyTo: null } },
        '"Smith, Jones LLC via EZ Draft" <test@example.test>',
        undefined,
      ],
      [
        '(f) backslash removed, semicolon quoted',
        { company: { name: 'O\\Brien; Sons', replyTo: null } },
        '"OBrien; Sons via EZ Draft" <test@example.test>',
        undefined,
      ],
    ];
    for (const [name, change, from, replyTo] of cases) {
      it(name, async () => {
        const r = await sendEmail({ ...INPUT, ...change } as typeof INPUT, { env: ENV_STUB });
        expect(r.link).toBe(LINK);
        const m = readStubOutbox()[0];
        expect(m.from).toBe(from);
        if (replyTo === undefined) expect('replyTo' in m).toBe(false);
        else expect(m.replyTo).toBe(replyTo);
      });
    }
  });
});

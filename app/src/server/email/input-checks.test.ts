// EZD-151 · email input checks and the stub outbox cap (vault/plans/EZD-151.md section 4, T1-T9).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  STUB_OUTBOX_MAX,
  clearStubOutbox,
  createStubTransport,
  readStubOutbox,
} from './test-harness/stub-transport';
import { readStubOutboxDir } from '../../../test-harness/email-outbox';
import { toSubjectLine as toSubjectLineFromIndex } from './index';
import { EmailInputError, sendEmail, toSubjectLine } from './send';
import type { SendEmailInput } from './types';

const LINK = 'https://ezdraft.ezcontractorbinder.com/invite/AbC123?ref=email&x=1';
const HTTP_LINK = 'http://ezdraft.example.test/invite/AbC123';
const TO = 'crew@example.test';
const FROM = 'EZ Draft Test <test@example.test>';
const ENV_STUB = { EMAIL_TRANSPORT: 'stub', EMAIL_FROM: FROM };
const INPUT: SendEmailInput = {
  to: TO,
  subject: 'Test subject',
  paragraphs: ['Line one', 'Line two'],
  link: { url: LINK, label: 'Open' },
};

// "Refused" = the promise rejects with an EmailInputError (code email_invalid_input) and nothing is recorded.
async function expectRefused(
  input: SendEmailInput,
  env: Record<string, string | undefined>,
): Promise<void> {
  let caught: unknown = null;
  try {
    await sendEmail(input, { env });
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(EmailInputError);
  expect((caught as EmailInputError).code).toBe('email_invalid_input');
  expect(readStubOutbox()).toHaveLength(0);
}

function stubMessage(n: number) {
  return {
    from: FROM,
    to: 'm' + n + '@example.test',
    subject: 'Test subject',
    text: 'Line one',
    html: '<p>Line one</p>',
  };
}

describe('EZD-151 email input checks and stub outbox cap', () => {
  beforeEach(() => {
    clearStubOutbox();
  });

  it('EZD-151 done when: a subject with \\u0007 or U+2028 is refused', async () => {
    await expectRefused({ ...INPUT, subject: 'a\u0007b' }, ENV_STUB);
    await expectRefused({ ...INPUT, subject: 'a b' }, ENV_STUB);
  });

  it('T2 other unsafe characters in the subject are refused', async () => {
    for (const subject of ['a b', 'a\u0085b', 'a\tb', 'a\u007fb', 'a\u0000b', 'a\u001fb']) {
      await expectRefused({ ...INPUT, subject }, ENV_STUB);
    }
  });

  it('T3 a printable non-ASCII subject passes unchanged', async () => {
    const subject = 'Café — résumé ✓';
    const r = await sendEmail({ ...INPUT, subject }, { env: ENV_STUB });
    expect(r.status).toBe('sent');
    expect(readStubOutbox()[0].subject).toBe(subject);
  });

  it('T4 a company name loses line separators', async () => {
    const r = await sendEmail(
      { ...INPUT, company: { name: 'Worth Properties ', replyTo: null } },
      { env: ENV_STUB },
    );
    expect(r.status).toBe('sent');
    expect(readStubOutbox()[0].from).toBe('WorthProperties via EZ Draft <test@example.test>');

    clearStubOutbox();
    await expectRefused({ ...INPUT, company: { name: ' \u0085', replyTo: null } }, ENV_STUB);
  });

  it('EZD-151 done when: an http link is refused when VERCEL_ENV is set', async () => {
    const input = { ...INPUT, link: { url: HTTP_LINK, label: 'Open' } };
    for (const vercelEnv of ['preview', 'production', 'development']) {
      await expectRefused(input, { ...ENV_STUB, VERCEL_ENV: vercelEnv });
    }
  });

  it('T6 https on Vercel and http locally still send', async () => {
    const a = await sendEmail(INPUT, { env: { ...ENV_STUB, VERCEL_ENV: 'preview' } });
    expect(a.status).toBe('sent');
    expect(a.link).toBe(LINK);

    const http = { ...INPUT, link: { url: HTTP_LINK, label: 'Open' } };
    const b = await sendEmail(http, { env: ENV_STUB });
    expect(b.status).toBe('sent');
    expect(b.link).toBe(HTTP_LINK);

    const c = await sendEmail(http, { env: { ...ENV_STUB, VERCEL_ENV: '' } });
    expect(c.status).toBe('sent');
    expect(c.link).toBe(HTTP_LINK);
  });

  it('T7 toSubjectLine turns each run of unsafe characters into one space and trims', () => {
    expect(toSubjectLine('a\r\nb')).toBe('a b');
    expect(toSubjectLine(' x  y\t')).toBe('x y');
    expect(toSubjectLine('plain')).toBe('plain');
    expect(toSubjectLine('\u0007')).toBe('');
    expect(toSubjectLineFromIndex).toBe(toSubjectLine);
  });

  it('EZD-151 done when: the stub outbox never holds more than N', async () => {
    expect(STUB_OUTBOX_MAX).toBe(100);
    const transport = createStubTransport();
    let firstId: string | null = null;
    for (let i = 1; i <= 105; i += 1) {
      const res = await transport.send(
        stubMessage(i),
        i === 1 ? { idempotencyKey: 'k1' } : undefined,
      );
      expect(res.ok).toBe(true);
      if (i === 1 && res.ok) firstId = res.messageId;
      expect(readStubOutbox()).toHaveLength(Math.min(i, 100));
    }
    const box = readStubOutbox();
    expect(box).toHaveLength(100);
    expect(box[0].to).toBe('m6@example.test');
    expect(box[99].to).toBe('m105@example.test');

    const again = await transport.send(stubMessage(106), { idempotencyKey: 'k1' });
    expect(firstId).not.toBeNull();
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.messageId).not.toBe(firstId);
    const after = readStubOutbox();
    expect(after).toHaveLength(100);
    expect(after[99].to).toBe('m106@example.test');
  });

  it('T9 the file sink is not capped', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ezd-outbox-'));
    try {
      const transport = createStubTransport({ dir });
      for (let i = 1; i <= 105; i += 1) {
        const res = await transport.send(stubMessage(i));
        expect(res.ok).toBe(true);
      }
      expect(readStubOutboxDir(dir)).toHaveLength(105);
      expect(readStubOutbox()).toHaveLength(100);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// EZD-036 U1 (vault/plans/EZD-036.md section 4): the email stub loads only when a stub send happens.
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const FROM = 'EZ Draft Test <test@example.test>';

describe('EZD-036 lazy email stub', () => {
  let loads = 0;
  beforeEach(() => {
    loads = 0;
    vi.resetModules();
    vi.doMock('./test-harness/stub-transport', async (importOriginal) => {
      loads += 1;
      return importOriginal();
    });
  });

  it('EZD-036 U1: the stub module loads on the first stub send, not at import or at choice', async () => {
    const { getEmailTransport } = await import('./transport');
    expect(loads).toBe(0);

    const a = getEmailTransport({
      EMAIL_TRANSPORT: 'resend',
      EMAIL_FROM: FROM,
      RESEND_API_KEY: 're_test',
    });
    expect(a.ok && a.transport.name).toBe('resend');
    expect(loads).toBe(0);

    const dir = mkdtempSync(path.join(tmpdir(), 'ezd036-mail-'));
    const b = getEmailTransport({ EMAIL_TRANSPORT: 'stub', EMAIL_FROM: FROM, EMAIL_STUB_DIR: dir });
    expect(b.ok).toBe(true);
    if (!b.ok) throw new Error('unreachable');
    expect(b.transport.name).toBe('stub');
    expect(loads).toBe(0);

    const message = {
      from: FROM,
      to: 'a@example.test',
      subject: 'EZD-036 probe',
      text: 't',
      html: '<p>t</p>',
    };
    const r1 = await b.transport.send(message, { idempotencyKey: 'k-036' });
    const r2 = await b.transport.send(message, { idempotencyKey: 'k-036' });
    expect(loads).toBe(1);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) throw new Error('unreachable');
    expect(r1.messageId).toMatch(/^stub_/);
    expect(r2.messageId).toBe(r1.messageId);

    const { readStubOutbox } = await import('./test-harness/stub-transport');
    expect(readStubOutbox().filter((m) => m.subject === 'EZD-036 probe')).toHaveLength(1);
    const files = readdirSync(dir).filter((f) => /^\d{13}-\d{6}-stub_.+\.json$/.test(f));
    expect(files).toHaveLength(1);
  });
});

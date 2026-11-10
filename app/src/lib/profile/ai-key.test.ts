// EZD-5601 T3 and T21 (vault/plans/EZD-5601.md section 1 "D-Shape", "D-Codes", section 4; AC-EZD-5601-1, -2,
// -5): the browser-safe key helpers. A fake fetch stands in for the route; nothing leaves the process.
import { describe, expect, it, vi } from 'vitest';
import { addAiKey, aiKeyShapeProblem, last4Of, normalizeAiKey, removeAiKey } from './ai-key';

const problemOf = (raw: string) => aiKeyShapeProblem(normalizeAiKey(raw));

describe('EZD-5601 ai-key lib', () => {
  it('T3 shape: printable ASCII after sk-ant-, at most 256 characters, whitespace trimmed at both ends', () => {
    expect(problemOf('sk-ant-a')).toBeNull();
    expect(normalizeAiKey('\n sk-ant-abc\t')).toBe('sk-ant-abc');
    expect(problemOf('\n sk-ant-abc\t')).toBeNull();
    expect(problemOf('sk-ant-' + 'a'.repeat(249))).toBeNull();

    expect(problemOf('')).toBe('ai_key_invalid');
    expect(problemOf('sk-abc')).toBe('ai_key_invalid');
    expect(problemOf('sk-ant-' + 'a'.repeat(250))).toBe('ai_key_invalid');
    expect(problemOf('sk-ant-a b')).toBe('ai_key_invalid');
    expect(problemOf('sk-ant-é')).toBe('ai_key_invalid');
    expect(problemOf('sk-ant-\u0000x')).toBe('ai_key_invalid');

    expect(last4Of('sk-ant-abcd1234')).toBe('1234');
  });

  const reply = (status: number, body: unknown) =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  const fake = (response: () => Response | Promise<Response>) =>
    vi.fn<typeof fetch>(async () => response());
  const codeBody = (code: string) => ({ error: { code, message_key: `error.${code}` } });

  it('T21 addAiKey: a bad shape makes no request; 200 is saved; each code maps to its message key', async () => {
    const never = fake(() => reply(200, { aiKey: { last4: 'x' } }));
    expect(await addAiKey('sk-x', never)).toEqual({
      kind: 'error',
      messageKey: 'error.ai_key_invalid',
    });
    expect(never).not.toHaveBeenCalled();

    const ok = fake(() => reply(200, { aiKey: { last4: '1234' } }));
    expect(await addAiKey('  sk-ant-abcd1234\n', ok)).toEqual({ kind: 'saved', last4: '1234' });
    expect(ok).toHaveBeenCalledTimes(1);
    const [url, init] = ok.mock.calls[0];
    expect(String(url)).toBe('/api/profile/ai-key');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('same-origin');
    expect(init?.body).toBe('{"key":"sk-ant-abcd1234"}');

    const statusOf: Record<string, number> = {
      invalid_input: 400,
      ai_key_invalid: 400,
      ai_key_refused: 400,
      ai_key_out_of_credit: 400,
      ai_key_check_failed: 502,
      ai_key_throttled: 429,
      ai_key_unavailable: 500,
      not_signed_in: 401,
      not_authorized: 403,
    };
    for (const [code, status] of Object.entries(statusOf)) {
      const r = await addAiKey(
        'sk-ant-abcd1234',
        fake(() => reply(status, codeBody(code))),
      );
      expect(r, code).toEqual({ kind: 'error', messageKey: `error.${code}` });
    }
    expect(
      await addAiKey(
        'sk-ant-abcd1234',
        fake(() => reply(403, codeBody('cross_origin_refused'))),
      ),
    ).toEqual({ kind: 'error', messageKey: 'error.not_authorized' });

    const dbDown = { kind: 'error', messageKey: 'error.db_unavailable' };
    expect(
      await addAiKey(
        'sk-ant-abcd1234',
        fake(() => reply(500, {})),
      ),
    ).toEqual(dbDown);
    expect(
      await addAiKey(
        'sk-ant-abcd1234',
        fake(() => reply(500, codeBody('something_else'))),
      ),
    ).toEqual(dbDown);
    expect(
      await addAiKey(
        'sk-ant-abcd1234',
        fake(() => {
          throw new Error('offline');
        }),
      ),
    ).toEqual(dbDown);
  });

  it('T21 removeAiKey: a 200 is removed with a DELETE to the same route', async () => {
    const ok = fake(() => reply(200, { aiKey: null }));
    expect(await removeAiKey(ok)).toEqual({ kind: 'removed' });
    const [url, init] = ok.mock.calls[0];
    expect(String(url)).toBe('/api/profile/ai-key');
    expect(init?.method).toBe('DELETE');
  });
});

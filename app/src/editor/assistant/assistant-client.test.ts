// EZD-5603a T5, T6 (vault/plans/EZD-5603a.md section 4; AC-EZD-5603-2, -5, -12, -14). The fetch is a stub; no
// live service. Sources: P5602 section 3 route row; Decided "Success shape", "Key read".
import { describe, expect, it, vi } from 'vitest';
import { postAssistantPrompt, readAiKeyState } from './assistant-client';

const INPUT = {
  prompt: 'add a door',
  history: [{ role: 'user' as const, text: 'hi' }],
  model: 'opus' as const,
  floorId: 'f-1',
  selectedIds: ['w-1'],
};
const SEND_FAILED = {
  kind: 'failure',
  failure: {
    kind: 'failed',
    messageKey: 'office.assistant.send_failed',
    profileLink: false,
    costMicroUsd: null,
  },
};
const json = (body: unknown, status = 200) => () =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const post = (impl: (...a: never[]) => Promise<Response>) =>
  postAssistantPrompt('p-1', INPUT, {
    signal: new AbortController().signal,
    fetchImpl: vi.fn(impl) as unknown as typeof fetch,
  });
const SUCCESS = {
  message: 'Done.',
  changes: [],
  refs: {},
  costMicroUsd: 20000,
  model: 'sonnet',
};

describe('EZD-5603a assistant-client', () => {
  it('T5 the request: one POST, same-origin, the signal, one FormData entry "request"', async () => {
    const fetchImpl = vi.fn(json(SUCCESS));
    const ctl = new AbortController();
    await postAssistantPrompt('p-1', INPUT, {
      signal: ctl.signal,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/projects/p-1/assistant');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(init.signal).toBe(ctl.signal);
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect([...form.keys()]).toEqual(['request']);
    expect(JSON.parse(form.get('request') as string)).toEqual(INPUT);
  });

  it('T6 answers: reply, failures, abort; the key read', async () => {
    expect(await post(json(SUCCESS))).toEqual({ kind: 'reply', success: SUCCESS });
    const { costMicroUsd: _omit, ...noCost } = SUCCESS;
    void _omit;
    expect(await post(json(noCost))).toEqual(SEND_FAILED);
    expect(await post(json({ ...SUCCESS, costMicroUsd: -1 }))).toEqual(SEND_FAILED);
    expect(
      await post(
        json(
          { error: { code: 'assistant_out_of_credit', message_key: 'error.assistant_out_of_credit' } },
          400,
        ),
      ),
    ).toEqual({
      kind: 'failure',
      failure: {
        kind: 'failed',
        messageKey: 'error.assistant_out_of_credit',
        profileLink: true,
        costMicroUsd: null,
      },
    });
    expect(await post(() => Promise.resolve(new Response('{', { status: 200 })))).toEqual(
      SEND_FAILED,
    );
    expect(await post(() => Promise.reject(new TypeError('network')))).toEqual(SEND_FAILED);
    expect(await post(() => Promise.reject(new DOMException('', 'AbortError')))).toEqual({
      kind: 'aborted',
    });

    const key = (impl: () => Promise<Response>) =>
      readAiKeyState({ fetchImpl: vi.fn(impl) as unknown as typeof fetch });
    expect(await key(json({ aiKey: null }))).toBe('none');
    expect(await key(json({ aiKey: { last4: '7Qx2' } }))).toBe('present');
    expect(await key(json({}))).toBe('failed');
    expect(await key(json({ aiKey: null }, 500))).toBe('failed');
    expect(await key(() => Promise.reject(new TypeError('network')))).toBe('failed');

    const fetchImpl = vi.fn(json({ aiKey: null }));
    await readAiKeyState({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/profile');
    expect(init.credentials).toBe('same-origin');
  });
});

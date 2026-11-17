// EZD-111 U2 (vault/plans/EZD-111.md section 4; P111 L3, L4; AC-EZD-111-1, -3). Expected values: P111 L3 and L4
// (201 → the send, an error → its code, a thrown fetch → status 0 `network`, the id URL-encoded).
import { describe, expect, it } from 'vitest';
import { fetchSendRecipient, postClientSend, type ClientSend } from './sends';

const SEND: ClientSend = {
  id: 's1',
  modelVersionId: 'v1',
  versionNo: 1,
  link: 'http://localhost:3000/c/' + 'A'.repeat(43),
  emailSent: true,
  recipient: { name: 'Zed Co', email: 'zedco@example.test' },
  holder: null,
  expiresAt: '2026-12-17T00:00:00.000Z',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('EZD-111 send API helpers', () => {
  it('U2 maps the POST and GET answers and encodes the project id', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const ok: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return json(201, { send: SEND });
    };
    expect(await postClientSend('p/1', 'x', { fetchImpl: ok })).toEqual({ ok: true, send: SEND });
    expect(calls[0].url).toBe('/api/projects/p%2F1/sends');
    expect(calls[0].init?.method).toBe('POST');
    expect(calls[0].init?.body).toBe('{"note":"x"}');

    const noClient: typeof fetch = async () => json(400, { error: { code: 'no_client' } });
    expect(await postClientSend('p/1', 'x', { fetchImpl: noClient })).toEqual({
      ok: false,
      status: 400,
      code: 'no_client',
    });

    const thrown: typeof fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(await postClientSend('p/1', 'x', { fetchImpl: thrown })).toEqual({
      ok: false,
      status: 0,
      code: 'network',
    });

    const none: typeof fetch = async () => json(200, { recipient: null });
    expect(await fetchSendRecipient('p/1', { fetchImpl: none })).toEqual({ ok: true, recipient: null });
  });
});

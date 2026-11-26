// EZD-111 U2 (vault/plans/EZD-111.md section 4; P111 L3, L4; AC-EZD-111-1, -3). Expected values: P111 L3 and L4
// (201 → the send, an error → its code, a thrown fetch → status 0 `network`, the id URL-encoded).
import { describe, expect, it } from 'vitest';
import { fetchSendRecipient, postClientSend, sendLabel, type ClientSend } from './sends';

const SEND: ClientSend = {
  id: 's1',
  modelVersionId: 'v1',
  versionNo: 1,
  revNo: null,
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

// EZD-719 (AC-EZD-719-1; S13 Controls "Version N before Rev 0, Rev N after"; R24 #26). Expected values: R24 #26
// (client sends before permit are "Version N"), S13 rule 12 and assumptions EZD-719 (after Rev 0 a client send is
// the next Rev N).
describe('EZD-719 send label', () => {
  it('AC-EZD-719-1 a client send before permit is labeled Version 1', () => {
    expect(sendLabel({ versionNo: 1, revNo: null })).toEqual({ kind: 'version', no: 1 });
  });

  it('a client send after Rev 0 is labeled with the Rev it took, not its sent number', () => {
    expect(sendLabel({ versionNo: 2, revNo: 1 })).toEqual({ kind: 'rev', no: 1 });
    expect(sendLabel({ versionNo: 4, revNo: 3 })).toEqual({ kind: 'rev', no: 3 });
  });
});

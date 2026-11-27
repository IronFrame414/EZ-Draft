// EZD-2017 (AC-EZD-2017-1, AC-EZD-2017-2). The slow condition of audit row 10 is reproduced with a stub server and
// a fixed delay per chunk: a body that takes far longer to send than the server takes to refuse. Expected values:
// the sizes below and the stub's own answer (413); nothing here reaches a live service.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { overLimitBody, sendUntilAnswered, STREAM_CHUNK_BYTES } from './over-limit-stream';

const N = 52428800;

const read = async (stream: ReadableStream<Uint8Array>) => {
  let bytes = 0;
  let chunks = 0;
  let last: Uint8Array | undefined;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    chunks += 1;
    last = value;
  }
  return { bytes, chunks, last };
};

describe('EZD-2017 over-limit body stream', () => {
  let early: Server;
  let late: Server;
  let lateReceived = 0;
  const urlOf = (server: Server) => `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;

  beforeAll(async () => {
    // Refuses on the headers alone and never reads the body.
    early = createServer((_req, res) => {
      res.writeHead(413, { 'content-type': 'text/plain' }).end('too large');
    });
    // Reads every byte, then refuses (how the local Storage gateway behaves).
    late = createServer((req, res) => {
      lateReceived = 0;
      req.on('data', (part: Buffer) => {
        lateReceived += part.length;
      });
      req.on('end', () => {
        res.writeHead(413, { 'content-type': 'text/plain' }).end('too large');
      });
    });
    await Promise.all(
      [early, late].map(
        (server) => new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)),
      ),
    );
  });

  afterAll(async () => {
    for (const server of [early, late]) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  const post = (url: string) => (stream: ReadableStream<Uint8Array>) =>
    fetch(url, {
      method: 'POST',
      body: stream,
      duplex: 'half',
      headers: { 'content-type': 'application/pdf' },
    } as RequestInit);

  it('S1 the stream carries exactly the bytes asked for, one byte over the limit', async () => {
    const body = overLimitBody(N + 1);
    const got = await read(body.stream);
    expect(got.bytes).toBe(52428801);
    expect(body.sent()).toBe(52428801);
    // 800 full chunks of 65536 bytes and one last byte.
    expect(STREAM_CHUNK_BYTES).toBe(65536);
    expect(got.chunks).toBe(801);
    expect(got.last).toEqual(new Uint8Array([0x61]));
  });

  it('S2 nothing is made before the request asks for it, and nothing after stop', async () => {
    const body = overLimitBody(N + 1);
    expect(body.sent()).toBe(0);
    const reader = body.stream.getReader();
    const first = await reader.read();
    expect(first.value?.length).toBe(65536);
    expect(body.sent()).toBe(65536);
    body.stop();
    expect(body.stopped()).toBe(true);
    expect((await reader.read()).done).toBe(true);
    expect(body.sent()).toBe(65536);
  });

  it('S3 a refusal that comes before the body is through stops the stream', async () => {
    // 801 chunks at 5 ms each is over 4 s of sending; the stub refuses at once.
    const body = overLimitBody(N + 1, { delayMs: 5 });
    const started = Date.now();
    const res = await sendUntilAnswered(body, post(urlOf(early)));
    const took = Date.now() - started;
    expect(res.status).toBe(413);
    expect(body.stopped()).toBe(true);
    const atAnswer = body.sent();
    expect(atAnswer).toBeLessThan(N + 1);
    expect(took).toBeLessThan(4000);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(body.sent()).toBe(atAnswer);
  }, 30000);

  it('S4 a server that reads the whole body first still gets every byte, then refuses', async () => {
    const body = overLimitBody(N + 1);
    const res = await sendUntilAnswered(body, post(urlOf(late)));
    expect(res.status).toBe(413);
    expect(body.sent()).toBe(52428801);
    expect(lateReceived).toBe(52428801);
  }, 60000);

  it('S5 the stream is stopped when the request fails', async () => {
    const body = overLimitBody(N + 1, { delayMs: 5 });
    await expect(
      sendUntilAnswered(body, () => Promise.reject(new Error('connection lost'))),
    ).rejects.toThrow('connection lost');
    expect(body.stopped()).toBe(true);
    expect(body.sent()).toBe(0);
  });
});

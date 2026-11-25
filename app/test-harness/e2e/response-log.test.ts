// EZD-427 (AC-EZD-427-1): the response log never waits on the body of a request that did not finish. The
// failing run (EZD-701 gate, 2026-11-20 17:59Z, trace.zip): all six job events arrived, then the test waited
// on response.body() of the home page's GET /api/realtime/token, cut off by the navigation to /dev/jobs,
// until the 60,000 ms test timeout.
import type { Request, Response } from '@playwright/test';
import { describe, expect, test } from 'vitest';
import { logResponses, type ResponseSource } from './response-log';

type Listeners = {
  response: ((response: Response) => void)[];
  requestfinished: ((request: Request) => void)[];
};

function fakePage() {
  const listeners: Listeners = { response: [], requestfinished: [] };
  const source = {
    on(event: keyof Listeners, listener: never) {
      listeners[event].push(listener);
    },
  } as ResponseSource;
  return { source, listeners };
}

type FakeBody = { text: string } | { never: true } | { throws: true };

function fakeResponse(url: string, headers: Record<string, string>, body: FakeBody) {
  let bodyCalls = 0;
  const response = {
    url: () => url,
    allHeaders: async () => headers,
    body: () => {
      bodyCalls++;
      if ('never' in body) return new Promise<Buffer>(() => {});
      if ('throws' in body) return Promise.reject(new Error('no body'));
      return Promise.resolve(Buffer.from(body.text, 'utf8'));
    },
  } as unknown as Response;
  const request = { response: async () => response } as unknown as Request;
  return { response, request, bodyCalls: () => bodyCalls };
}

describe('EZD-427 response log', () => {
  test('EZD-427 (a) a finished response is logged with its headers and body', async () => {
    const { source, listeners } = fakePage();
    const log = logResponses(source);
    const r = fakeResponse('http://127.0.0.1/api/jobs/1', { 'x-a': 'one', 'x-b': 'two' }, { text: 'hello' });
    listeners.response.forEach((l) => l(r.response));
    listeners.requestfinished.forEach((l) => l(r.request));
    expect(await log.settle()).toEqual([
      { url: 'http://127.0.0.1/api/jobs/1', headers: ['one', 'two'], body: 'hello' },
    ]);
  });

  test('EZD-427 (b) a response whose request never finishes does not hold settle and its body is not read', async () => {
    const { source, listeners } = fakePage();
    const log = logResponses(source);
    const cut = fakeResponse('http://127.0.0.1/api/realtime/token', { 'x-a': 'one' }, { never: true });
    const whole = fakeResponse('http://127.0.0.1/dev/jobs', { 'x-b': 'two' }, { text: 'page' });
    listeners.response.forEach((l) => l(cut.response));
    listeners.response.forEach((l) => l(whole.response));
    listeners.requestfinished.forEach((l) => l(whole.request));
    expect(await log.settle()).toEqual([
      { url: 'http://127.0.0.1/api/realtime/token', headers: ['one'], body: '' },
      { url: 'http://127.0.0.1/dev/jobs', headers: ['two'], body: 'page' },
    ]);
    expect(cut.bodyCalls()).toBe(0);
    expect(whole.bodyCalls()).toBe(1);
  });

  test('EZD-427 (c) a finished response with no body (a redirect) is logged with an empty body', async () => {
    const { source, listeners } = fakePage();
    const log = logResponses(source);
    const r = fakeResponse('http://127.0.0.1/auth/confirm', { location: '/' }, { throws: true });
    listeners.response.forEach((l) => l(r.response));
    listeners.requestfinished.forEach((l) => l(r.request));
    expect(await log.settle()).toEqual([
      { url: 'http://127.0.0.1/auth/confirm', headers: ['/'], body: '' },
    ]);
  });
});

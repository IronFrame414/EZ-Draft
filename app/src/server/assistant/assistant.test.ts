// EZD-5602 T9, T10 (vault/plans/EZD-5602.md section 1 step 11, Decided "D-Reply", "D-Body", "D-Stubs", section 4;
// AC-EZD-5602-2, -8, -11, -14). parseAssistantReply takes one JSON object { message, changes } (at most 100
// changes, no roughOpeningMode anywhere inside them), optionally in one code fence; readAssistantBody takes one
// multipart `request` part under 4,000,000 bytes, refuses a photo part for now, and keeps the last 20 turns.
import { describe, expect, it } from 'vitest';
import { parseAssistantReply, readAssistantBody } from './assistant';

// D-Stubs reply texts.
const TEXT_ONLY = '{"message":"The kitchen is 80 square feet.","changes":[]}';
const MALFORMED = '{"message":"Added a door","changes":[';

const FLOOR = 'A1B2C3D4-0000-4000-8000-00000000000F';
const DEFAULT = {
  prompt: 'Add a door',
  history: [] as { role: 'user' | 'assistant'; text: string }[],
  model: 'sonnet',
  floorId: FLOOR,
  selectedIds: [] as string[],
};
const URL_ = 'http://localhost/api/projects/x/assistant';

const formRequest = (form: FormData) => new Request(URL_, { method: 'POST', body: form });
const withRequest = (value: unknown) => {
  const form = new FormData();
  form.append('request', typeof value === 'string' ? value : JSON.stringify(value));
  return formRequest(form);
};

// A multipart body of exactly `total` bytes whose one `request` part is the default JSON padded with spaces.
function paddedMultipart(total: number): Request {
  const boundary = 'ezd5602boundary';
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="request"\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;
  const json = JSON.stringify(DEFAULT);
  const pad = total - Buffer.byteLength(head + json + tail);
  const text = head + json + ' '.repeat(pad) + tail;
  expect(Buffer.byteLength(text)).toBe(total);
  return new Request(URL_, {
    method: 'POST',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    body: text,
  });
}

const turns = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    text: `t${i + 1}`,
  }));

const uuids = (n: number) => Array.from({ length: n }, () => crypto.randomUUID());

describe('EZD-5602 assistant reply and body', () => {
  it('T9 parseAssistantReply: the envelope, fenced or not; anything else is null', () => {
    const parsed = { message: 'The kitchen is 80 square feet.', changes: [] };
    expect(parseAssistantReply(TEXT_ONLY)).toEqual(parsed);
    expect(parseAssistantReply('```json\n' + TEXT_ONLY + '\n```')).toEqual(parsed);
    expect(parseAssistantReply(MALFORMED)).toBeNull();
    expect(parseAssistantReply('[]')).toBeNull();
    expect(
      parseAssistantReply(
        JSON.stringify({ message: 'The kitchen is 80 square feet.', changes: [], x: 1 }),
      ),
    ).toBeNull();
    const hundred = Array.from({ length: 100 }, () => ({}));
    expect(
      parseAssistantReply(
        JSON.stringify({ message: 'The kitchen is 80 square feet.', changes: hundred }),
      ),
    ).toEqual({ message: 'The kitchen is 80 square feet.', changes: hundred });
    expect(
      parseAssistantReply(
        JSON.stringify({ message: 'The kitchen is 80 square feet.', changes: [...hundred, {}] }),
      ),
    ).toBeNull();
    expect(
      parseAssistantReply(
        JSON.stringify({
          message: 'The kitchen is 80 square feet.',
          changes: [{ fields: { roughOpeningMode: 'auto' } }],
        }),
      ),
    ).toBeNull();
  });

  it('T10 readAssistantBody: one multipart request part, the limits of D-Body, the last 20 turns kept', async () => {
    const ok = await readAssistantBody(withRequest(DEFAULT));
    expect(ok).toEqual({ ok: true, input: { ...DEFAULT, floorId: FLOOR.toLowerCase() } });

    const invalid = { ok: false, code: 'invalid_input' };

    // application/json; 4,000,001 bytes; an extra part; request twice; request as a file
    expect(
      await readAssistantBody(
        new Request(URL_, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(DEFAULT),
        }),
      ),
    ).toEqual(invalid);
    expect(await readAssistantBody(paddedMultipart(4_000_001))).toEqual(invalid);
    const extra = new FormData();
    extra.append('request', JSON.stringify(DEFAULT));
    extra.append('x', '1');
    expect(await readAssistantBody(formRequest(extra))).toEqual(invalid);
    const twice = new FormData();
    twice.append('request', JSON.stringify(DEFAULT));
    twice.append('request', JSON.stringify(DEFAULT));
    expect(await readAssistantBody(formRequest(twice))).toEqual(invalid);
    const asFile = new FormData();
    asFile.append(
      'request',
      new Blob([JSON.stringify(DEFAULT)], { type: 'application/json' }),
      'r.json',
    );
    expect(await readAssistantBody(formRequest(asFile))).toEqual(invalid);

    // a photo file
    const photo = new FormData();
    photo.append('request', JSON.stringify(DEFAULT));
    photo.append(
      'photo',
      new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }),
      'p.png',
    );
    expect(await readAssistantBody(formRequest(photo))).toEqual({
      ok: false,
      code: 'photo_not_supported',
    });

    // request text `{`; an extra key; model haiku
    expect(await readAssistantBody(withRequest('{'))).toEqual(invalid);
    expect(await readAssistantBody(withRequest({ ...DEFAULT, maxTokens: 10 }))).toEqual(invalid);
    expect(await readAssistantBody(withRequest({ ...DEFAULT, model: 'haiku' }))).toEqual(invalid);

    // prompt 8,000 / 8,001 characters
    const long = 'p'.repeat(8000);
    expect(await readAssistantBody(withRequest({ ...DEFAULT, prompt: long }))).toEqual({
      ok: true,
      input: { ...DEFAULT, prompt: long, floorId: FLOOR.toLowerCase() },
    });
    expect(await readAssistantBody(withRequest({ ...DEFAULT, prompt: long + 'p' }))).toEqual(
      invalid,
    );

    // prompt of spaces; a 2,001-character turn; history starting with assistant
    expect(await readAssistantBody(withRequest({ ...DEFAULT, prompt: '  ' }))).toEqual(invalid);
    expect(
      await readAssistantBody(
        withRequest({
          ...DEFAULT,
          history: [
            { role: 'user', text: 'u'.repeat(2001) },
            { role: 'assistant', text: 'a' },
          ],
        }),
      ),
    ).toEqual(invalid);
    expect(
      await readAssistantBody(
        withRequest({ ...DEFAULT, history: [{ role: 'assistant', text: 'a' }] }),
      ),
    ).toEqual(invalid);

    // 22 alternating turns: the oldest two dropped
    expect(await readAssistantBody(withRequest({ ...DEFAULT, history: turns(22) }))).toEqual({
      ok: true,
      input: { ...DEFAULT, history: turns(22).slice(2), floorId: FLOOR.toLowerCase() },
    });
    expect(turns(22).slice(2)[0].text).toBe('t3');

    // 1,001 selected ids
    expect(await readAssistantBody(withRequest({ ...DEFAULT, selectedIds: uuids(1001) }))).toEqual(
      invalid,
    );
  });
});

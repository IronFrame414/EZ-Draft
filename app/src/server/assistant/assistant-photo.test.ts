// EZD-5603b T16 (vault/plans/EZD-5603b.md section 3 X2, section 4; AC-EZD-5603-7, -13). readAssistantBody with an
// optional `photo` part: the schema is checked first, then the photo is stripped; a photo that is not a JPEG
// sharp can re-encode is `photo_unreadable`; a `photo` text field is `invalid_input`. Expected values: Decided
// "Body order"; Q-0637. The multipart bodies are built by hand with a fixed boundary.
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  PNG_SIGNATURE,
  buildMultipart,
  gpsJpeg,
  multipartRequest,
} from '../../../test-harness/assistant-photo';
import { readAssistantBody } from './assistant';

const FLOOR = 'A1B2C3D4-0000-4000-8000-00000000000F';
const DEFAULT = {
  prompt: 'Add a door',
  history: [] as { role: 'user' | 'assistant'; text: string }[],
  model: 'sonnet',
  floorId: FLOOR,
  selectedIds: [] as string[],
};
const URL_ = 'http://localhost/api/projects/x/assistant';
const BOUNDARY = 'ezd5603bboundary';
const body = (...parts: Parameters<typeof buildMultipart>[1]) =>
  multipartRequest(URL_, BOUNDARY, buildMultipart(BOUNDARY, parts));
const request = (over: object = DEFAULT) => ({ name: 'request', data: JSON.stringify(over) });
const photoPart = (data: Uint8Array) => ({
  name: 'photo',
  data,
  filename: 'photo.jpg',
  contentType: 'image/jpeg',
});

describe('EZD-5603b assistant body photo', () => {
  it('T16 a photo is stripped; a text photo, an unreadable photo and a bad schema are refused in that order', async () => {
    const withGps = new Uint8Array(await gpsJpeg());
    const ok = await readAssistantBody(body(request(), photoPart(withGps)));
    expect(ok.ok).toBe(true);
    if (!ok.ok) throw new Error('not ok');
    expect(ok.photo).not.toBeNull();
    const meta = await sharp(ok.photo as Uint8Array).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.exif).toBeUndefined();

    expect(await readAssistantBody(body(request(), { name: 'photo', data: 'not a file' }))).toEqual({
      ok: false,
      code: 'invalid_input',
    });
    expect(
      await readAssistantBody(body(request(), photoPart(Uint8Array.from([...PNG_SIGNATURE, 0, 0, 0, 0])))),
    ).toEqual({ ok: false, code: 'photo_unreadable' });
    expect(
      await readAssistantBody(
        body(request({ ...DEFAULT, model: 'haiku' }), photoPart(Uint8Array.from([...PNG_SIGNATURE, 0]))),
      ),
    ).toEqual({ ok: false, code: 'invalid_input' });

    const none = await readAssistantBody(body(request()));
    expect(none).toMatchObject({ ok: true, photo: null });
  });
});

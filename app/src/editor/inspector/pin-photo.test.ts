// EZD-220 (AC-EZD-220-2, -3, -4; Q-0513 photo types JPEG, PNG, HEIC; 03c:15 source_file; Q-0704 03-data-model "File
// references are checked on save"; Q-0704 05-screens "A failed photo upload keeps the pin and shows a retry state;
// offline, the change queues in the outbox"; 03b rule 9). App routes are stubbed and the signed upload goes to EZD-132's
// in-memory TUS server, so no network is reached (CLAUDE.md rule 5). Expected: a photo is started as kind photo with
// its name, type and size, its bytes reach Storage unchanged, it is completed, and only then does the pin take its id;
// a failure keeps the pin, and Retry sends only what is left; another file type is refused before any call.
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { createFakeTus, type FakeTus } from '../../../test-utils/storage/fake-tus';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { createModelStore } from '../model/model-store';
import { baseObjects, F1, uid } from '../tools/test-utils/fixtures';
import {
  checkPinPhoto,
  fetchPhotoLink,
  PinPhotoError,
  pinKindChange,
  pinPhotoChange,
  uploadPinPhoto,
  type PhotoAttempt,
} from './pin-photo';

const P = '11111111-1111-4111-8111-111111111111';
const FILE = '00000001-0000-4000-8000-000000000000';
const PIN = uid(900);

function withPin(): Map<string, ObjectValue> {
  const o = baseObjects();
  o.set(PIN, {
    type: 'pin',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: {
      geometry: { point: { x: 48, y: 30 } },
      status: 'existing',
      level: F1,
      attributes: { kind: 'damage_moisture', photoFileId: null },
    },
  });
  return o;
}

type Call = { method: string; path: string; body: unknown };

function harness(o: { storageDown?: () => boolean; completeStatus?: () => number } = {}) {
  const calls: Call[] = [];
  const tus: FakeTus = createFakeTus();
  const sign = 'https://storage.test/sign/1';
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.startsWith('/api/')) {
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null;
      calls.push({ method, path: url, body });
      if (url === `/api/projects/${P}/source-files`) {
        return Response.json(
          {
            sourceFile: { id: FILE },
            upload: { bucket: 'sources', path: `t/${P}/${FILE}`, token: 'tok', url: sign },
          },
          { status: 201 },
        );
      }
      if (url.endsWith('/complete'))
        return Response.json({ sourceFile: {} }, { status: o.completeStatus?.() ?? 200 });
      if (url.endsWith('/link'))
        return Response.json({ url: 'https://storage.test/object/sign/x' }, { status: 200 });
      return new Response(null, { status: 404 });
    }
    if (o.storageDown?.()) throw new TypeError('fetch failed');
    return tus.fetchImpl(input, init);
  };
  return { calls, tus, fetchImpl };
}

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
const photo = { name: 'leak.jpg', blob: new Blob([jpeg]), contentType: 'image/jpeg' as const };

describe('EZD-220 AC-2 which files a pin photo takes', () => {
  it('a JPEG, PNG or HEIC is taken as its type; any other file is refused', () => {
    expect(checkPinPhoto('leak.jpg', 10)).toEqual({ ok: true, contentType: 'image/jpeg' });
    expect(checkPinPhoto('LEAK.JPEG', 10)).toEqual({ ok: true, contentType: 'image/jpeg' });
    expect(checkPinPhoto('stain.png', 10)).toEqual({ ok: true, contentType: 'image/png' });
    expect(checkPinPhoto('IMG_0001.HEIC', 10)).toEqual({ ok: true, contentType: 'image/heic' });
    for (const name of [
      'report.pdf',
      'plan.dxf',
      'scan.glb',
      'clip.gif',
      'notes.txt',
      'plan.dwg',
      'noext',
    ])
      expect(checkPinPhoto(name, 10), name).toEqual({ ok: false, reason: 'not_photo' });
    expect(checkPinPhoto('leak.jpg', 0)).toEqual({ ok: false, reason: 'empty' });
    expect(checkPinPhoto('leak.jpg', 52_428_801)).toEqual({ ok: false, reason: 'too_large' });
  });
});

describe('EZD-220 photo upload', () => {
  it('AC-2 starts a photo row, sends the bytes unchanged, completes it, and answers its id', async () => {
    const h = harness();
    const attempt = { current: null as PhotoAttempt };
    const id = await uploadPinPhoto(P, photo, attempt, {
      fetchImpl: h.fetchImpl,
      retryDelaysMs: [],
    });
    expect(id).toBe(FILE);
    expect(h.calls).toEqual([
      {
        method: 'POST',
        path: `/api/projects/${P}/source-files`,
        body: { kind: 'photo', originalName: 'leak.jpg', contentType: 'image/jpeg', size: 9 },
      },
      { method: 'POST', path: `/api/source-files/${FILE}/complete`, body: null },
    ]);
    expect(h.tus.stored()).toEqual(jpeg);
  });

  it('AC-3, -4 a failed upload keeps the pin without the photo; Retry sends only the rest, then the pin takes it', async () => {
    let down = true;
    const h = harness({ storageDown: () => down });
    const store = createModelStore({ objects: withPin() });
    const attempt = { current: null as PhotoAttempt };
    await expect(
      uploadPinPhoto(P, photo, attempt, { fetchImpl: h.fetchImpl, retryDelaysMs: [] }),
    ).rejects.toEqual(new PinPhotoError('upload_failed'));
    // The pin is kept as it was: no photo id that the save check would refuse as still uploading.
    const pin = store.getState().objects.get(PIN)!;
    expect((pin.data.attributes as { photoFileId: unknown }).photoFileId).toBeNull();
    expect(attempt.current).toMatchObject({ sourceFileId: FILE, sent: false });

    down = false;
    const id = await uploadPinPhoto(P, photo, attempt, {
      fetchImpl: h.fetchImpl,
      retryDelaysMs: [],
    });
    expect(h.calls.map((c) => c.path)).toEqual([
      `/api/projects/${P}/source-files`,
      `/api/source-files/${FILE}/complete`,
    ]);
    const change = pinPhotoChange(store.getState().objects, PIN, id);
    store.applyEdit([change!]);
    const after = store.getState().objects.get(PIN)!;
    expect(after.data.attributes).toEqual({ kind: 'damage_moisture', photoFileId: FILE });
  });

  it('AC-4 a failed complete is retried without sending the bytes again', async () => {
    let status = 500;
    const h = harness({ completeStatus: () => status });
    const attempt = { current: null as PhotoAttempt };
    await expect(
      uploadPinPhoto(P, photo, attempt, { fetchImpl: h.fetchImpl, retryDelaysMs: [] }),
    ).rejects.toEqual(new PinPhotoError('upload_failed'));
    const patches = h.tus.requests.filter((r) => r.method === 'PATCH').length;
    status = 200;
    expect(
      await uploadPinPhoto(P, photo, attempt, { fetchImpl: h.fetchImpl, retryDelaysMs: [] }),
    ).toBe(FILE);
    expect(h.tus.requests.filter((r) => r.method === 'PATCH').length).toBe(patches);
    expect(h.calls.filter((c) => c.path.endsWith('/source-files'))).toHaveLength(1);
  });

  it('AC-6 a start refused for want of Edit model is not_authorized', async () => {
    const fetchImpl: typeof fetch = async () => new Response(null, { status: 403 });
    await expect(
      uploadPinPhoto(P, photo, { current: null }, { fetchImpl, retryDelaysMs: [] }),
    ).rejects.toEqual(new PinPhotoError('not_authorized'));
  });

  it('AC-4 offline: the start cannot be sent, so the upload fails and the pin stays', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new TypeError('fetch failed');
    };
    await expect(
      uploadPinPhoto(P, photo, { current: null }, { fetchImpl, retryDelaysMs: [] }),
    ).rejects.toEqual(new PinPhotoError('upload_failed'));
  });
});

describe('EZD-220 pin edits and the thumbnail link', () => {
  it('the photo and kind edits change only that attribute; a non-pin id gives no edit', () => {
    const o = withPin();
    expect(pinPhotoChange(o, PIN.toUpperCase(), FILE)?.value?.data).toMatchObject({
      status: 'existing',
      attributes: { kind: 'damage_moisture', photoFileId: FILE },
    });
    expect(pinKindChange(o, PIN, 'lead')?.value?.data).toMatchObject({
      attributes: { kind: 'lead', photoFileId: null },
    });
    expect(pinPhotoChange(o, F1, FILE)).toBeNull();
    expect(pinPhotoChange(o, uid(12345), FILE)).toBeNull();
  });

  it('AC-2 the thumbnail link comes from the link route; any refusal is no link', async () => {
    const h = harness();
    expect(await fetchPhotoLink(FILE, { fetchImpl: h.fetchImpl })).toBe(
      'https://storage.test/object/sign/x',
    );
    expect(h.calls).toEqual([
      { method: 'GET', path: `/api/source-files/${FILE}/link`, body: null },
    ]);
    const refused: typeof fetch = async () => new Response(null, { status: 404 });
    expect(await fetchPhotoLink(FILE, { fetchImpl: refused })).toBeNull();
  });
});

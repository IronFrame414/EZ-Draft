// EZD-5603b T17-T20 (vault/plans/EZD-5603b.md section 4; AC-EZD-5603-7, -8, -13). POST /api/projects/[id]/assistant
// with a photo on the local stack and the stub recordings, in a file next to P5602's route.test.ts and with its
// setup copied (member M with a key row, the v4 project, AI_MODE=stub, `stubWith`, `lastStubRequests`). Expected
// values: Q-0637 (the server strips; a photo it cannot re-encode is refused with nothing sent; bytes stay in
// function memory), Q-0638 gap 7 (one image, with its prompt only), Q-0512 (4,000,000 bytes), AC-8, AC-13.
import * as Sentry from '@sentry/nextjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import v4 from '../../../../../../../packages/geometry/src/schema/samples/v4.json';
import { uid } from '../../../../../../../packages/geometry/src/rooms/test-utils/fixtures';
import sharp from 'sharp';
import {
  PHOTO_CANARY,
  PNG_SIGNATURE,
  XMP_CANARY,
  buildMultipart,
  corruptJpeg,
  gpsJpeg,
  multipartRequest,
  padJpeg,
  solidJpeg,
} from '../../../../../../test-harness/assistant-photo';
import { holdErrorAlertLock } from '../../../../../../test-harness/errors/alert-lock';
import { setPermissions } from '../../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  type Member,
} from '../../../../../../test-harness/rls/fixtures';
import { ASSISTANT_RECORDINGS } from '../../../../../server/ai/test-harness/recordings/anthropic';
import {
  clearStubRecordings,
  lastStubRequests,
  setStubRecording,
} from '../../../../../server/ai/test-harness/stub';
import type { AssistantInput } from '../../../../../server/assistant/assistant';
import { encryptUserAiKey, parseEncryptionKeys } from '../../../../../server/assistant/key-crypto';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../../server/auth/supabase-server';
import { initErrorReporting } from '../../../../../server/errors/sentry-options';
import {
  clearSentryStubOutbox,
  readSentryStubOutbox,
} from '../../../../../server/errors/test-harness/sentry-stub-transport';

const state = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [...state.store].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options: unknown) => {
      const maxAge = (options as { maxAge?: number } | undefined)?.maxAge;
      if (value === '' || maxAge === 0) state.store.delete(name);
      else state.store.set(name, value);
    },
  }),
  headers: async () => new Headers(),
}));

const CANARY_KEY = 'sk-ant-api03-EZD5602CANARYKEY0000000000000000';
const PURPOSE = 'assistant.plan';
type StubName = keyof typeof ASSISTANT_RECORDINGS;

function jarOver(store: Map<string, string>): SessionCookieJar {
  return {
    getAll: () => [...store].map(([name, value]) => ({ name, value })),
    set: (name, value, options) => {
      if (value === '' || options?.maxAge === 0) store.delete(name);
      else store.set(name, value);
    },
    isHttps: () => false,
  };
}

async function cookiesFor(email: string): Promise<Map<string, string>> {
  const { data: link, error: linkError } = await adminDb().auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError || !link.properties) throw new Error(`generateLink failed: ${linkError?.message}`);
  const store = new Map<string, string>();
  const { error } = await createSessionClient(jarOver(store)).auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (error) throw new Error(`verifyOtp failed: ${error.message}`);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return store;
}



async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// v4.json with new ids: every object sorted by its original id gets uid(1..16), so id order is kept within
// each type; level and hostWallId follow.
type Stored = { id: string; type: string; schema_version: number; data: Record<string, unknown> };
const SAMPLE = v4.objects as unknown as Stored[];
const NEW_ID = new Map(
  [...SAMPLE]
    .map((o) => o.id.toLowerCase())
    .sort()
    .map((id, i) => [id, uid(i + 1)] as const),
);
const copyOf = (id: string) => NEW_ID.get(id.toLowerCase()) as string;

const F1_ORIG = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
const KITCHEN_F1_ORIG = '6a5bae36-e7f4-4459-a3b8-b1528fbd8a21';
const F1 = copyOf(F1_ORIG);


function remapped(o: Stored): Record<string, unknown> {
  const data = structuredClone(o.data) as Record<string, unknown> & {
    level?: string;
    name?: string;
    geometry?: { hostWallId?: string | null };
    attributes?: { name?: string };
  };
  if (typeof data.level === 'string') data.level = copyOf(data.level);
  if (data.geometry && typeof data.geometry.hostWallId === 'string')
    data.geometry.hostWallId = copyOf(data.geometry.hostWallId);
  if (o.id === F1_ORIG) data.name = 'Canary Lane level';
  if (o.id === KITCHEN_F1_ORIG && data.attributes) data.attributes.name = 'Quixote $13,579 kitchen';
  return data;
}

const DEFAULT_INPUT = (): AssistantInput => ({
  prompt: 'Add a door',
  history: [],
  model: 'sonnet',
  floorId: F1,
  selectedIds: [],
});


describe('EZD-5603b assistant route photo', () => {
  let tenant = '';
  let project = '';
  let m: Member;
  let mCookies: Map<string, string>;
  let releaseLock: () => Promise<void> = async () => {};

  const sql = () => harnessSql();

  async function post(
    id: string,
    input: unknown,
    cookies: Map<string, string> | null = mCookies,
  ): Promise<{ res: Response; json: unknown }> {
    state.store = cookies === null ? new Map() : new Map(cookies);
    const form = new FormData();
    form.append('request', JSON.stringify(input));
    const { POST } = await import('./route');
    const res = await POST(
      new Request(`http://localhost/api/projects/${id}/assistant`, { method: 'POST', body: form }),
      { params: Promise.resolve({ id }) },
    );
    return { res, json: await parse(res) };
  }


  const stubWith = (name: StubName) =>
    setStubRecording('anthropic', PURPOSE, ASSISTANT_RECORDINGS[name]);

  const usageRows = () =>
    sql()<{ model: string; cost: string }[]>`
      select model, cost_usd::text as cost from public.ai_usage
      where app_user_id = ${m.appUserId}::uuid order by created_at`;
  const mySlots = () =>
    sql()<{ id: string; finished_at: Date | null }[]>`
      select id, finished_at from public.ai_assistant_slot where app_user_id = ${m.appUserId}::uuid`;

  function expectOneUserKeyRequest(label: string) {
    const requests = lastStubRequests('anthropic');
    expect(requests, label).toHaveLength(1);
    expect(requests[0].headers['x-api-key'] === CANARY_KEY, label).toBe(true);
    return requests[0];
  }

  async function storeKeyRow(ciphertext: string, secretVersion = 1) {
    await sql()`delete from public.user_ai_key where app_user_id = ${m.appUserId}::uuid`;
    await sql()`
      insert into public.user_ai_key (tenant_id, app_user_id, ciphertext, secret_version, last4)
      values (${tenant}::uuid, ${m.appUserId}::uuid, ${ciphertext}, ${secretVersion}, '0000')`;
  }


  beforeAll(async () => {
    releaseLock = await holdErrorAlertLock();
    await sql()`delete from public.error_alert`;
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');

    tenant = await createTenant();
    [project] = await createProjects(tenant, 1);

    m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, ['edit_model']);

    const keys = parseEncryptionKeys();
    const mine = encryptUserAiKey(CANARY_KEY, { tenantId: tenant, appUserId: m.appUserId }, keys);
    await storeKeyRow(mine.ciphertext, mine.secretVersion);

    const customer = await adminDb()
      .from('customer')
      .insert({
        tenant_id: tenant,
        name: 'Zebulon Quixote',
        email: 'zebulon.quixote@example.test',
        address: '987 Canary Lane',
      })
      .select('id')
      .single();
    if (customer.error || !customer.data)
      throw new Error(`customer insert failed: ${customer.error?.message}`);
    const linked = await adminDb()
      .from('project')
      .update({ customer_id: customer.data.id, address: '987 Canary Lane' })
      .eq('id', project);
    if (linked.error) throw new Error(`project update failed: ${linked.error.message}`);

    const db = sql();
    await db`delete from public.model_object where project_id = ${project}::uuid and type = 'floor'`;
    let seq = 1;
    for (const o of SAMPLE) {
      await db`insert into public.model_object
        (project_id, object_id, tenant_id, type, data, schema_version, updated_seq, deleted)
        values (${project}::uuid, ${copyOf(o.id)}::uuid, ${tenant}::uuid, ${o.type},
          ${db.json(remapped(o) as never)}, 4, ${seq++}, false)`;
    }

    mCookies = await cookiesFor(m.email);
  }, 180000);

  beforeEach(async () => {
    clearStubRecordings();
    clearSentryStubOutbox();
    await sql()`delete from public.error_alert`;
    await sql()`delete from public.ai_assistant_slot where app_user_id = ${m.appUserId}::uuid`;
    await sql()`delete from public.ai_usage where app_user_id = ${m.appUserId}::uuid`;
  });

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    try {
      clearStubRecordings();
      await sql()`delete from public.error_alert`;
      await cleanup();
      await closeHarness();
      await Sentry.close(2000);
    } finally {
      await releaseLock();
    }
  }, 180000);

  const BOUNDARY = 'ezd5603bboundary';
  const requestPart = (input: unknown) => ({ name: 'request', data: JSON.stringify(input) });
  const photoPart = (data: Uint8Array) => ({
    name: 'photo',
    data,
    filename: 'photo.jpg',
    contentType: 'image/jpeg',
  });
  async function postRaw(body: Uint8Array): Promise<{ res: Response; json: unknown }> {
    state.store = new Map(mCookies);
    const { POST } = await import('./route');
    const res = await POST(
      multipartRequest(`http://localhost/api/projects/${project}/assistant`, BOUNDARY, body),
      { params: Promise.resolve({ id: project }) },
    );
    return { res, json: await parse(res) };
  }
  const postWith = (input: unknown, photo: Uint8Array) =>
    postRaw(buildMultipart(BOUNDARY, [requestPart(input), photoPart(photo)]));

  type Sent = {
    messages: {
      role: string;
      content: { type: string; source?: { media_type: string; data: string } }[];
    }[];
  };
  const imageOf = (bodyText: string) => {
    const last = (JSON.parse(bodyText) as Sent).messages.at(-1)!;
    return {
      types: last.content.map((c) => c.type),
      image: last.content.find((c) => c.type === 'image'),
    };
  };
  const storageCount = async () =>
    (await sql()<{ n: number }[]>`select count(*)::int as n from storage.objects`)[0].n;
  const allJobs = async () =>
    (await sql()<{ n: number }[]>`select count(*)::int as n from public.job`)[0].n;

  it('T17 a body of exactly 4,000,000 bytes with a 3,500,000-byte photo is accepted and sent as one 1568 x 1176 image', async () => {
    stubWith('text_only');
    const photo = padJpeg(new Uint8Array(await solidJpeg(1568, 1176)), 3_500_000);
    const json = JSON.stringify(DEFAULT_INPUT());
    const base = buildMultipart(BOUNDARY, [{ name: 'request', data: json }, photoPart(photo)]);
    const pad = 4_000_000 - base.length;
    expect(pad).toBeGreaterThanOrEqual(0);
    const body = buildMultipart(BOUNDARY, [
      { name: 'request', data: json + ' '.repeat(pad) },
      photoPart(photo),
    ]);
    expect(body.byteLength).toBe(4_000_000);
    const r = await postRaw(body);
    expect(r.res.status).toBe(200);
    const sent = expectOneUserKeyRequest('max body');
    const { types, image } = imageOf(sent.bodyText ?? '');
    expect(types).toEqual(['text', 'image', 'text']);
    expect(image?.source?.media_type).toBe('image/jpeg');
    const meta = await sharp(Buffer.from(image!.source!.data, 'base64')).metadata();
    expect(meta.format).toBe('jpeg');
    expect([meta.width, meta.height]).toEqual([1568, 1176]);
  }, 120000);

  it('T18 a photo the server cannot re-encode is refused with nothing sent, no slot and no usage row', async () => {
    stubWith('text_only');
    const slotsBefore = (await mySlots()).length;
    const usageBefore = (await usageRows()).length;
    for (const bad of [Uint8Array.from([...PNG_SIGNATURE, 1, 2, 3, 4]), corruptJpeg()]) {
      const r = await postWith(DEFAULT_INPUT(), bad);
      expect(r.res.status).toBe(400);
      expect(r.json).toEqual({
        error: { code: 'photo_unreadable', message_key: 'error.assistant_photo_unreadable' },
      });
    }
    expect(lastStubRequests('anthropic')).toEqual([]);
    expect((await mySlots()).length).toBe(slotsBefore);
    expect((await usageRows()).length).toBe(usageBefore);
  }, 120000);

  it('T19 the sent image has no EXIF or XMP, and the next prompt goes without it', async () => {
    stubWith('text_only');
    const first = await postWith(DEFAULT_INPUT(), new Uint8Array(await gpsJpeg()));
    expect(first.res.status).toBe(200);
    const one = expectOneUserKeyRequest('prompt 1');
    const { image } = imageOf(one.bodyText ?? '');
    const meta = await sharp(Buffer.from(image!.source!.data, 'base64')).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();

    clearStubRecordings();
    stubWith('text_only');
    const reply = (first.json as { message: string }).message;
    const second = await post(project, {
      ...DEFAULT_INPUT(),
      prompt: 'And another',
      history: [
        { role: 'user', text: 'Add a door' },
        { role: 'assistant', text: reply },
      ],
    });
    expect(second.res.status).toBe(200);
    const two = expectOneUserKeyRequest('prompt 2');
    expect(two.bodyText ?? '').not.toContain('"type":"image"');
    expect(two.bodyText ?? '').not.toContain('base64');
  }, 120000);

  it('T20 the photo is kept nowhere: no table, no storage object, no job, no report, no log line', async () => {
    const seen: string[] = [];
    const record = (...args: unknown[]) => {
      seen.push(
        args
          .map((a) => (a instanceof Uint8Array ? Buffer.from(a).toString('utf8') : String(a)))
          .join(' '),
      );
    };
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const)
      vi.spyOn(console, method).mockImplementation(record);
    const out = process.stdout.write.bind(process.stdout);
    const errOut = process.stderr.write.bind(process.stderr);
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown, ...rest: unknown[]) => {
      record(chunk);
      return (out as (...a: unknown[]) => boolean)(chunk, ...rest);
    }) as typeof process.stdout.write);
    vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown, ...rest: unknown[]) => {
      record(chunk);
      return (errOut as (...a: unknown[]) => boolean)(chunk, ...rest);
    }) as typeof process.stderr.write);

    const objectsBefore = await storageCount();
    const jobsBefore = await allJobs();
    stubWith('text_only');
    const gps = new Uint8Array(await gpsJpeg());
    const upload = padJpeg(gps, gps.length + 200, PHOTO_CANARY);
    const ok = await postWith(DEFAULT_INPUT(), upload);
    expect(ok.res.status).toBe(200);
    const sentImage = imageOf(expectOneUserKeyRequest('canary').bodyText ?? '').image!.source!.data;
    const refused = await postWith(DEFAULT_INPUT(), Uint8Array.from([...PNG_SIGNATURE, 9, 9]));
    expect(refused.res.status).toBe(400);

    const needles = [
      PHOTO_CANARY,
      XMP_CANARY,
      sentImage.slice(40, 120),
      Buffer.from(upload).toString('base64').slice(40, 120),
      // bytea shows as hex (\x...) in a row's text: both canaries and a slice of the upload.
      Buffer.from(PHOTO_CANARY).toString('hex'),
      Buffer.from(XMP_CANARY).toString('hex'),
      Buffer.from(upload.subarray(20, 60)).toString('hex'),
      // the stripped JPEG sent to the provider, as bytea hex: image data near its end, not the shared header.
      Buffer.from(sentImage, 'base64').subarray(-80, -40).toString('hex'),
    ];
    const db = sql();
    const tables = await db<{ table_schema: string; table_name: string }[]>`
      select table_schema, table_name from information_schema.tables
      where table_schema in ('public', 'private') and table_type = 'BASE TABLE'`;
    expect(tables.length).toBeGreaterThan(0);
    const hits: string[] = [];
    let uninspected = 0;
    for (const t of tables) {
      for (const needle of needles) {
        try {
          const [row] = await db.unsafe<{ n: number }[]>(
            `select count(*)::int as n from "${t.table_schema}"."${t.table_name}" t
             where strpos(t::text, $1) > 0`,
            [needle],
          );
          if (row.n > 0) hits.push(`${t.table_schema}.${t.table_name}`);
        } catch {
          uninspected += 1;
        }
      }
    }
    expect(uninspected).toBe(0);
    expect(hits).toEqual([]);

    await Sentry.flush(2000);
    const reports = JSON.stringify(readSentryStubOutbox());
    const logs = seen.join('\n');
    for (const needle of needles) {
      expect(reports.includes(needle)).toBe(false);
      expect(logs.includes(needle)).toBe(false);
    }
    expect(await storageCount()).toBe(objectsBefore);
    expect(await allJobs()).toBe(jobsBefore);
  }, 180000);
});

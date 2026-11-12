// EZD-5602 T14-T23 (vault/plans/EZD-5602.md section 1 Decided "D-Route", "D-Run order", "D-Map", "D-Cost",
// "D-Stubs", "D-Projection", section 4; AC-EZD-5602-1 to -14). POST /api/projects/[id]/assistant on the local
// stack and the stub recordings. next/headers is mocked and members sign in as in
// app/src/app/api/projects/[id]/objects/route.test.ts. The project's model is the 16 objects of
// packages/geometry/src/schema/samples/v4.json with new ids (uid(n), id order kept within each type), stored
// at schema_version 4, with the canaries of the plan's section 4 in the customer, the addresses, Floor 1's name
// and the Kitchen's name. Expected values: 09l (costs), D-Map and D-Route (statuses and codes), Q-0637 and Q-0638
// (one call, user key, no job row, limits), Q-0474 (canaries never sent). The key is compared only as a boolean
// (L-018).
import { randomUUID } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import v4 from '../../../../../../../packages/geometry/src/schema/samples/v4.json';
import { uid } from '../../../../../../../packages/geometry/src/rooms/test-utils/fixtures';
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
import { eventsIn } from '../../../../../../test-harness/sentry-outbox';
import type { Recording } from '../../../../../server/ai/test-harness/recorded-fetch';
import { ASSISTANT_RECORDINGS } from '../../../../../server/ai/test-harness/recordings/anthropic';
import {
  clearStubRecordings,
  lastStubRequests,
  setStubRecording,
} from '../../../../../server/ai/test-harness/stub';
import { runAssistantPrompt, type AssistantInput } from '../../../../../server/assistant/assistant';
import { encryptUserAiKey, parseEncryptionKeys } from '../../../../../server/assistant/key-crypto';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../../server/auth/supabase-server';
import type { Database } from '../../../../../server/db/database.types';
import { initErrorReporting } from '../../../../../server/errors/sentry-options';
import {
  clearSentryStubOutbox,
  readSentryStubOutbox,
} from '../../../../../server/errors/test-harness/sentry-stub-transport';
import type { PermissionContext } from '../../../../../server/permissions/context';

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

const NOT_SIGNED_IN = { error: { code: 'not_signed_in', message_key: 'error.not_signed_in' } };
const FORBIDDEN = { error: { code: 'permission_denied', message_key: 'error.not_authorized' } };
const err = (code: string, messageKey = `error.${code}`) => ({
  error: { code, message_key: messageKey },
});

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
const F2_ORIG = '3917dda6-80b4-45ae-8bc0-59144aa66585';
const KITCHEN_F1_ORIG = '6a5bae36-e7f4-4459-a3b8-b1528fbd8a21';
const W2_ORIG = 'aaf876ba-3f51-4bdc-a79b-74af4fe95f45';
const DOOR_ORIG = '05339e81-17bb-4a72-a80a-f0dba166d978';
const F1 = copyOf(F1_ORIG);

const EXPECTED_REFS = {
  f1: F1,
  f2: copyOf(F2_ORIG),
  w1: copyOf('09b59d6e-533b-46c4-8bb8-16d36a317520'),
  w2: copyOf(W2_ORIG),
  w3: copyOf('dd95bb08-124b-4347-9069-a741a3766dc8'),
  w4: copyOf('f13937da-4cb2-441d-b2e5-53a53715307b'),
  o1: copyOf('0236f1bd-ff22-4297-bdbb-98ec96f4ffae'),
  o2: copyOf(DOOR_ORIG),
  r1: copyOf(KITCHEN_F1_ORIG),
};

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

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-/i;
const noStore = (r: Response) => expect(r.headers.get('cache-control') ?? '').toContain('no-store');

const ADD_DOOR_CHANGES = [{ op: 'add', type: 'door', ref: 'n1', hostWall: 'w2' }];

// D-Map: the route answer per error recording.
const ERROR_CASES: Array<[StubName, number, string, string?]> = [
  ['error_401', 400, 'assistant_key_refused'],
  ['error_403', 400, 'assistant_key_refused'],
  ['error_402', 400, 'assistant_out_of_credit'],
  ['error_400_usage_limit', 400, 'assistant_out_of_credit'],
  ['error_429_spend_limit', 400, 'assistant_out_of_credit'],
  ['error_429', 429, 'assistant_provider_rate_limited'],
  ['error_400', 502, 'assistant_request_refused'],
  ['error_404', 502, 'assistant_request_refused'],
  ['error_413', 502, 'assistant_request_refused'],
  ['error_500', 502, 'assistant_provider_unavailable', 'error.assistant_unavailable'],
  ['error_504', 502, 'assistant_provider_unavailable', 'error.assistant_unavailable'],
  ['error_529', 502, 'assistant_provider_unavailable', 'error.assistant_unavailable'],
];

describe('EZD-5602 assistant route', () => {
  let tenant = '';
  let project = '';
  let otherProject = '';
  let m: Member;
  let c: Member;
  let listed: Member;
  let mCookies: Map<string, string>;
  let cCookies: Map<string, string>;
  let listedCookies: Map<string, string>;
  let mKeyCiphertext = '';
  let mKeyVersion = 0;
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

  const mClient = (): SupabaseClient<Database> => createSessionClient(jarOver(new Map(mCookies)));
  const mCtx = (): PermissionContext => ({
    appUserId: m.appUserId,
    membershipId: m.membershipId,
    scope: 'all',
    permissions: new Set(['edit_model']),
    listedProjectIds: new Set<string>(),
  });

  const stubWith = (name: StubName) =>
    setStubRecording('anthropic', PURPOSE, ASSISTANT_RECORDINGS[name]);

  const usageRows = () =>
    sql()<{ model: string; cost: string }[]>`
      select model, cost_usd::text as cost from public.ai_usage
      where app_user_id = ${m.appUserId}::uuid order by created_at`;
  const mySlots = () =>
    sql()<{ id: string; finished_at: Date | null }[]>`
      select id, finished_at from public.ai_assistant_slot where app_user_id = ${m.appUserId}::uuid`;
  const jobCount = async () =>
    (
      await sql()<
        { n: number }[]
      >`select count(*)::int as n from public.job where tenant_id = ${tenant}::uuid`
    )[0].n;
  const seqSum = async () =>
    (
      await sql()<{ s: string | null }[]>`
        select sum(updated_seq)::text as s from public.model_object where project_id = ${project}::uuid`
    )[0].s;

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

  async function sentryValues(): Promise<string[]> {
    await Sentry.flush(2000);
    return eventsIn(readSentryStubOutbox()).map((e) => e.exception?.values?.[0]?.value as string);
  }

  beforeAll(async () => {
    releaseLock = await holdErrorAlertLock();
    await sql()`delete from public.error_alert`;
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');

    tenant = await createTenant();
    [project] = await createProjects(tenant, 1);
    const otherTenant = await createTenant();
    [otherProject] = await createProjects(otherTenant, 1);

    m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, ['edit_model']);
    c = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, c.membershipId, []);
    listed = await createMember({ tenantId: tenant, scope: 'listed', listed: [] });
    await setPermissions(tenant, listed.membershipId, ['edit_model']);

    const keys = parseEncryptionKeys();
    const mine = encryptUserAiKey(CANARY_KEY, { tenantId: tenant, appUserId: m.appUserId }, keys);
    mKeyCiphertext = mine.ciphertext;
    mKeyVersion = mine.secretVersion;
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
    cCookies = await cookiesFor(c.email);
    listedCookies = await cookiesFor(listed.email);
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

  it('T14 refuses no session, no Edit model switch, a bad id, an unlisted project and another company, with no request', async () => {
    const body = DEFAULT_INPUT();
    const a = await post(project, body, null);
    expect(a.res.status).toBe(401);
    expect(a.json).toEqual(NOT_SIGNED_IN);

    const b = await post(project, body, cCookies);
    expect(b.res.status).toBe(403);
    expect(b.json).toEqual(FORBIDDEN);

    for (const [label, id, cookies] of [
      ['nope', 'nope', mCookies],
      ['listed member off the project', project, listedCookies],
      ["another tenant's project", otherProject, mCookies],
    ] as const) {
      const r = await post(id, body, cookies);
      expect(r.res.status, label).toBe(404);
      expect(r.json, label).toEqual(err('project_not_found'));
      noStore(r.res);
    }
    expect(lastStubRequests('anthropic')).toEqual([]);
  }, 120000);

  it('EZD-5602 done when: T15 one prompt makes one provider call with the user key, no job row, and the 09l cost', async () => {
    const jobsBefore = await jobCount();

    stubWith('add_door');
    const sonnet = await post(project, DEFAULT_INPUT());
    expect(sonnet.res.status).toBe(200);
    noStore(sonnet.res);
    expect(sonnet.json).toEqual({
      message: "Added a 3' door on w2.",
      changes: ADD_DOOR_CHANGES,
      refs: EXPECTED_REFS,
      costMicroUsd: 20000,
      model: 'sonnet',
    });
    expect(EXPECTED_REFS.w2).toBe(copyOf(W2_ORIG));
    expectOneUserKeyRequest('sonnet');

    clearStubRecordings();
    stubWith('add_door');
    const opus = await post(project, { ...DEFAULT_INPUT(), model: 'opus' });
    expect(opus.res.status).toBe(200);
    expect((opus.json as { costMicroUsd: number }).costMicroUsd).toBe(40000);
    expect((opus.json as { model: string }).model).toBe('opus');
    expectOneUserKeyRequest('opus');

    expect(await usageRows()).toEqual([
      { model: 'claude-sonnet-5-5', cost: '0.020000' },
      { model: 'claude-opus-5-5', cost: '0.040000' },
    ]);
    expect(await jobCount()).toBe(jobsBefore);
  }, 120000);

  it('T16 no key: 400 assistant_no_key; a key that does not decrypt: 400 assistant_key_refused, row kept, reported', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'env-key');
    try {
      await sql()`delete from public.user_ai_key where app_user_id = ${m.appUserId}::uuid`;
      const none = await post(project, DEFAULT_INPUT());
      expect(none.res.status).toBe(400);
      expect(none.json).toEqual(err('assistant_no_key'));
      expect(lastStubRequests('anthropic')).toEqual([]);

      const theirs = encryptUserAiKey(
        CANARY_KEY,
        { tenantId: tenant, appUserId: c.appUserId },
        parseEncryptionKeys(),
      );
      await storeKeyRow(theirs.ciphertext, theirs.secretVersion);
      clearSentryStubOutbox();
      const refused = await post(project, DEFAULT_INPUT());
      expect(refused.res.status).toBe(400);
      expect(refused.json).toEqual(err('assistant_key_refused'));
      expect(lastStubRequests('anthropic')).toEqual([]);
      const kept = await sql()<{ ciphertext: string }[]>`
        select ciphertext from public.user_ai_key where app_user_id = ${m.appUserId}::uuid`;
      expect(kept).toHaveLength(1);
      expect(kept[0].ciphertext === theirs.ciphertext).toBe(true);
      expect(await sentryValues()).toEqual(['ai_key_undecryptable']);
    } finally {
      await storeKeyRow(mKeyCiphertext, mKeyVersion);
    }
  }, 120000);

  it('T17 the request sent holds no canary name, address, price or id; refs and the selection instead', async () => {
    const r = await post(project, { ...DEFAULT_INPUT(), selectedIds: [copyOf(DOOR_ORIG)] });
    expect(r.res.status).toBe(200);
    const sent = expectOneUserKeyRequest('canaries');
    const text = sent.bodyText ?? '';
    expect(text.length).toBeGreaterThan(0);
    for (const canary of ['Zebulon', 'Quixote', '987 Canary', 'Canary Lane', '13,579', '13579'])
      expect(text.toLowerCase().includes(canary.toLowerCase()), canary).toBe(false);
    expect(UUID_RE.test(text)).toBe(false);
    // D-Request: the drawing JSON travels inside the last user message's 'Drawing:\n' text block.
    const body = JSON.parse(text) as {
      messages: { role: string; content: { type: string; text?: string }[] }[];
    };
    const last = body.messages[body.messages.length - 1];
    const block = last.content.find(
      (c) => c.type === 'text' && (c.text ?? '').startsWith('Drawing:\n'),
    );
    expect(block).toBeDefined();
    const drawing = (block?.text ?? '').slice('Drawing:\n'.length);
    expect(drawing).toContain('"label":"Room 1"');
    expect(drawing).toContain('"selected":["o2"]');
    expect(drawing).toContain('"ref":"f2"');
    expect(drawing).not.toContain('"w5"');
  }, 120000);

  it('T18 provider errors map to D-Map with one request, no usage row and no model change', async () => {
    const before = await seqSum();
    for (const [name, status, code, messageKey] of ERROR_CASES) {
      clearStubRecordings();
      stubWith(name);
      const r = await post(project, DEFAULT_INPUT());
      expect(r.res.status, name).toBe(status);
      expect(r.json, name).toEqual(err(code, messageKey));
      expectOneUserKeyRequest(name);
    }

    clearStubRecordings();
    stubWith('timeout');
    const timedOut = await runAssistantPrompt(mClient(), mCtx(), project, DEFAULT_INPUT(), {
      budgetMs: 50,
    });
    expect(timedOut).toEqual({
      status: 504,
      body: err('assistant_timeout', 'error.assistant_unavailable'),
    });
    expectOneUserKeyRequest('timeout');

    expect(await usageRows()).toEqual([]);
    expect(await seqSum()).toBe(before);
  }, 120000);

  it('T19 a reply that does not parse is billed when usage came back, and free when it did not', async () => {
    stubWith('malformed');
    const billed = await post(project, DEFAULT_INPUT());
    expect(billed.res.status).toBe(502);
    expect(billed.json).toEqual({ ...err('assistant_invalid_reply'), costMicroUsd: 12000 });
    expect(await usageRows()).toEqual([{ model: 'claude-sonnet-5-5', cost: '0.012000' }]);

    clearStubRecordings();
    const textOnly = ASSISTANT_RECORDINGS.text_only;
    const badUsage: Recording = {
      ...textOnly,
      exchanges: textOnly.exchanges.map((e) => ({
        ...e,
        response: {
          ...e.response,
          json: { ...(e.response.json as Record<string, unknown>), usage: { input_tokens: 'x' } },
        },
      })),
    };
    setStubRecording('anthropic', PURPOSE, badUsage);
    const free = await post(project, DEFAULT_INPUT());
    expect(free.res.status).toBe(502);
    expect(free.json).toEqual({ ...err('assistant_invalid_reply'), costMicroUsd: 0 });
    expect(await usageRows()).toEqual([{ model: 'claude-sonnet-5-5', cost: '0.012000' }]);
  }, 120000);

  it('T20 one prompt in flight, 30 a minute, and the time budget and a closed tab end the call', async () => {
    // (a) A in flight; B refused; A times out; C goes through.
    stubWith('timeout');
    // Load the route once first, so B's import cannot outlast A's 1,000 ms budget.
    await import('./route');
    const a = runAssistantPrompt(
      mClient(),
      mCtx(),
      project,
      { ...DEFAULT_INPUT(), prompt: 'prompt A' },
      { budgetMs: 1000 },
    );
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const open = await sql()`
        select 1 from public.ai_assistant_slot
        where app_user_id = ${m.appUserId}::uuid and finished_at is null`;
      if (open.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const b = await post(project, { ...DEFAULT_INPUT(), prompt: 'prompt B' });
    expect(b.res.status).toBe(429);
    expect(b.json).toEqual(err('assistant_busy'));
    const aResult = await a;
    expect(aResult).toEqual({
      status: 504,
      body: err('assistant_timeout', 'error.assistant_unavailable'),
    });
    const sentSoFar = lastStubRequests('anthropic');
    expect(sentSoFar).toHaveLength(1);
    expect(sentSoFar[0].bodyText ?? '').toContain('prompt A');
    expect(sentSoFar[0].bodyText ?? '').not.toContain('prompt B');
    const aSlots = await mySlots();
    expect(aSlots.length).toBeGreaterThan(0);
    for (const s of aSlots) expect(s.finished_at).not.toBeNull();
    clearStubRecordings();
    stubWith('text_only');
    const cRes = await post(project, DEFAULT_INPUT());
    expect(cRes.res.status).toBe(200);

    // (b) 30 slots in the last minute
    await sql()`delete from public.ai_assistant_slot where app_user_id = ${m.appUserId}::uuid`;
    await sql()`
      insert into public.ai_assistant_slot (tenant_id, app_user_id, started_at, finished_at)
      select ${tenant}::uuid, ${m.appUserId}::uuid, now() - interval '10 seconds', now() - interval '10 seconds'
      from generate_series(1, 30)`;
    clearStubRecordings();
    const limited = await post(project, DEFAULT_INPUT());
    expect(limited.res.status).toBe(429);
    expect(limited.json).toEqual(err('assistant_rate_limited'));
    expect(lastStubRequests('anthropic')).toEqual([]);

    // (c) the tab closes 20 ms in
    await sql()`delete from public.ai_assistant_slot where app_user_id = ${m.appUserId}::uuid`;
    await sql()`delete from public.ai_usage where app_user_id = ${m.appUserId}::uuid`;
    clearStubRecordings();
    stubWith('timeout');
    const controller = new AbortController();
    const started = Date.now();
    setTimeout(() => controller.abort(), 20);
    const closed = await runAssistantPrompt(mClient(), mCtx(), project, DEFAULT_INPUT(), {
      signal: controller.signal,
    });
    expect(closed.status).toBe(504);
    expect(Date.now() - started).toBeLessThan(1000);
    const cSlots = await mySlots();
    expect(cSlots).toHaveLength(1);
    expect(cSlots[0].finished_at).not.toBeNull();
    expect(await usageRows()).toEqual([]);
  }, 120000);

  it('T21 a drawing over the size limit is refused before any call', async () => {
    const w2 = SAMPLE.find((o) => o.id === W2_ORIG) as Stored;
    const data = remapped(w2);
    const db = sql();
    const ids = Array.from({ length: 1800 }, () => randomUUID());
    try {
      await db`insert into public.model_object
        (project_id, object_id, tenant_id, type, data, schema_version, updated_seq, deleted)
        select ${project}::uuid, x::uuid, ${tenant}::uuid, 'wall', ${db.json(data as never)}, 4, 100, false
        from unnest(${db.array(ids)}::text[]) as x`;
      const r = await post(project, DEFAULT_INPUT());
      expect(r.res.status).toBe(400);
      expect(r.json).toEqual(err('assistant_drawing_too_large'));
      expect(lastStubRequests('anthropic')).toEqual([]);
      expect(await usageRows()).toEqual([]);
      const slots = await mySlots();
      expect(slots).toHaveLength(1);
      expect(slots[0].finished_at).not.toBeNull();
    } finally {
      await db`delete from public.model_object
        where project_id = ${project}::uuid and object_id = any (${db.array(ids)}::uuid[])`;
    }
  }, 120000);

  it('T22 a failed usage write is reported and the answer stands', async () => {
    stubWith('add_door');
    const real = mClient();
    const failing = new Proxy(real, {
      get(target, prop, receiver) {
        if (prop === 'rpc') {
          return (fn: string, ...rest: unknown[]) => {
            if (fn === 'record_ai_usage')
              return Promise.resolve({ data: null, error: { code: 'XX000', message: 'boom' } });
            return (target.rpc as (...a: unknown[]) => unknown).call(target, fn, ...rest);
          };
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as SupabaseClient<Database>;
    const r = await runAssistantPrompt(failing, mCtx(), project, DEFAULT_INPUT());
    expect(r.status).toBe(200);
    expect((r.body as { costMicroUsd: number }).costMicroUsd).toBe(20000);
    expect(await sentryValues()).toEqual(['ai_usage_write_failed']);
    expect(await usageRows()).toEqual([]);
  }, 120000);

  it('T23 the prompt and the reply are kept nowhere: no table, no report, no log line', async () => {
    const PROMPT = 'CANARY-PROMPT-5602';
    const REPLY = 'CANARY-REPLY-5602';
    const seen: string[] = [];
    const record = (...args: unknown[]) => {
      seen.push(
        args
          .map((a) =>
            typeof a === 'string'
              ? a
              : a instanceof Uint8Array
                ? Buffer.from(a).toString('utf8')
                : String(a),
          )
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

    const textOnly = ASSISTANT_RECORDINGS.text_only;
    const canaryReply: Recording = {
      ...textOnly,
      exchanges: textOnly.exchanges.map((e) => {
        const json = e.response.json as { content: { type: string; text: string }[] };
        return {
          ...e,
          response: {
            ...e.response,
            json: {
              ...json,
              content: [{ type: 'text', text: JSON.stringify({ message: REPLY, changes: [] }) }],
            },
          },
        };
      }),
    };
    setStubRecording('anthropic', PURPOSE, canaryReply);
    const ok = await post(project, { ...DEFAULT_INPUT(), prompt: PROMPT });
    expect(ok.res.status).toBe(200);

    clearStubRecordings();
    stubWith('error_500');
    const failed = await post(project, { ...DEFAULT_INPUT(), prompt: PROMPT });
    expect(failed.res.status).toBe(502);

    clearStubRecordings();
    setStubRecording('anthropic', PURPOSE, {
      ...textOnly,
      exchanges: textOnly.exchanges.map((e) => ({ ...e, match: { ...e.match, method: 'GET' } })),
    });
    const broken = await post(project, { ...DEFAULT_INPUT(), prompt: PROMPT });
    expect(broken.res.status).toBe(500);
    expect(broken.json).toEqual(err('db_unavailable'));

    const db = sql();
    const tables = await db<{ table_schema: string; table_name: string }[]>`
      select table_schema, table_name from information_schema.tables
      where table_schema in ('public', 'private') and table_type = 'BASE TABLE'`;
    expect(tables.length).toBeGreaterThan(0);
    const hits: string[] = [];
    let uninspected = 0;
    for (const t of tables) {
      try {
        const [row] = await db.unsafe<{ n: number }[]>(
          `select count(*)::int as n from "${t.table_schema}"."${t.table_name}" t
           where t::text like '%' || $1 || '%' or t::text like '%' || $2 || '%'`,
          [PROMPT, REPLY],
        );
        if (row.n > 0) hits.push(`${t.table_schema}.${t.table_name}`);
      } catch {
        uninspected += 1;
      }
    }
    expect(uninspected).toBe(0);
    expect(hits).toEqual([]);

    await Sentry.flush(2000);
    const reports = JSON.stringify(readSentryStubOutbox());
    expect(reports.includes(PROMPT)).toBe(false);
    expect(reports.includes(REPLY)).toBe(false);
    const logs = seen.join('\n');
    expect(logs.includes(PROMPT)).toBe(false);
    expect(logs.includes(REPLY)).toBe(false);
  }, 180000);
});

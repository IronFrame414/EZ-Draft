// EZD-5601 T17 (vault/plans/EZD-5601.md section 1 "D-Load", "D-Rewrap", section 4; AC-EZD-5601-3, -10):
// loadUserAiKeyForCall and rewrapStaleAiKeys on the local stack. Keys are stored through addUserAiKey on the
// built-in key-check recording; rotation uses the plan's K2 (base64 of 32 bytes filled with 0x02). The secret
// is compared only as a boolean (L-018).
import { randomUUID } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { holdErrorAlertLock } from '../../../test-harness/errors/alert-lock';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  type Member,
} from '../../../test-harness/rls/fixtures';
import { eventsIn } from '../../../test-harness/sentry-outbox';
import { clearLastRecordedRequests } from '../ai/test-harness/recorded-fetch';
import { clearStubRecordings, lastStubRequests } from '../ai/test-harness/stub';
import { createSessionClient, type SessionCookieJar } from '../auth/supabase-server';
import { initErrorReporting } from '../errors/sentry-options';
import {
  clearSentryStubOutbox,
  readSentryStubOutbox,
} from '../errors/test-harness/sentry-stub-transport';
import { rewrapStaleAiKeys } from '../jobs/ai-key-rewrap';
import { decryptUserAiKey, parseEncryptionKeys } from './key-crypto';
import { addUserAiKey, loadUserAiKeyForCall } from './user-key';

const CANARY = 'sk-ant-api03-EZD5601CANARY' + randomUUID().replaceAll('-', '');
const K2 = Buffer.alloc(32, 2).toString('base64');
const TEST_KEYS = '1:' + Buffer.alloc(32).toString('base64');
const BOTH = `${TEST_KEYS},2:${K2}`;
const ENV = 'AI_KEY_ENCRYPTION_KEYS';

type Row = { tenant_id: string; ciphertext: string; secret_version: number };
const rowOf = async (appUserId: string): Promise<Row[]> =>
  harnessSql()<Row[]>`
    select tenant_id, ciphertext, secret_version from public.user_ai_key
    where app_user_id = ${appUserId}::uuid`;

async function sessionFor(member: Member) {
  const { data: link, error: linkError } = await adminDb().auth.admin.generateLink({
    type: 'magiclink',
    email: member.email,
  });
  if (linkError || !link.properties) throw new Error(`generateLink failed: ${linkError?.message}`);
  const store = new Map<string, string>();
  const jar: SessionCookieJar = {
    getAll: () => [...store].map(([name, value]) => ({ name, value })),
    set: (name, value, options) => {
      if (value === '' || options?.maxAge === 0) store.delete(name);
      else store.set(name, value);
    },
    isHttps: () => false,
  };
  const client = createSessionClient(jar);
  const { error } = await client.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (error) throw new Error(`verifyOtp failed: ${error.message}`);
  const session = {
    authUserId: member.authUserId,
    appUserId: member.appUserId,
    email: member.email,
  };
  return { client, session };
}

async function storeKey(member: Member) {
  const { client, session } = await sessionFor(member);
  const added = await addUserAiKey(client, session, CANARY);
  expect(added.status).toBe(200);
  return { client, session };
}

describe('EZD-5601 user key load and rewrap', () => {
  let releaseLock: () => Promise<void> = async () => {};

  beforeAll(async () => {
    releaseLock = await holdErrorAlertLock();
    await harnessSql()`delete from public.error_alert`;
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
  }, 120000);

  beforeEach(async () => {
    clearSentryStubOutbox();
    clearStubRecordings();
    await harnessSql()`delete from public.error_alert`;
  });

  afterAll(async () => {
    try {
      await harnessSql()`delete from public.error_alert`;
      await cleanup();
      await closeHarness();
      await Sentry.close(2000);
    } finally {
      await releaseLock();
    }
  }, 180000);

  it('T17 load: none without a key; the key with one; rewrapped to the highest version on use; a copied row is undecryptable', async () => {
    const tenant = await createTenant();
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    const c = await createMember({ tenantId: tenant, scope: 'all' });
    const mine = await sessionFor(m);

    expect(await loadUserAiKeyForCall(mine.client)).toEqual({ kind: 'none' });

    await storeKey(m);
    const loaded = await loadUserAiKeyForCall(mine.client);
    expect(loaded.kind).toBe('key');
    if (loaded.kind === 'key') expect(loaded.key.reveal() === CANARY).toBe(true);
    const before = await rowOf(m.appUserId);
    expect(before[0].secret_version).toBe(1);

    // a colleague's row holding a copy of M's ciphertext
    await harnessSql()`
      insert into public.user_ai_key (tenant_id, app_user_id, ciphertext, secret_version, last4)
      values (${tenant}::uuid, ${c.appUserId}::uuid, ${before[0].ciphertext}, 1, ${CANARY.slice(-4)})`;

    const rotated = await loadUserAiKeyForCall(mine.client, { env: { [ENV]: BOTH } });
    expect(rotated.kind).toBe('key');
    if (rotated.kind === 'key') expect(rotated.key.reveal() === CANARY).toBe(true);
    const after = await rowOf(m.appUserId);
    expect(after[0].secret_version).toBe(2);
    expect(
      decryptUserAiKey(
        { ciphertext: after[0].ciphertext, secretVersion: 2 },
        { tenantId: tenant, appUserId: m.appUserId },
        parseEncryptionKeys({ [ENV]: `2:${K2}` }),
      ) === CANARY,
    ).toBe(true);

    clearSentryStubOutbox();
    clearLastRecordedRequests();
    const theirs = await sessionFor(c);
    expect(await loadUserAiKeyForCall(theirs.client)).toEqual({ kind: 'undecryptable' });
    expect(await rowOf(c.appUserId)).toHaveLength(1);
    expect(lastStubRequests('anthropic')).toHaveLength(0);
    await Sentry.flush(2000);
    const events = eventsIn(readSentryStubOutbox());
    expect(events).toHaveLength(1);
    expect(events[0].exception.values[0].value).toBe('ai_key_undecryptable');
  }, 120000);

  it('T17 rewrap: rows below the highest version are re-encrypted; a row that does not decrypt is counted and left alone', async () => {
    const tenant = await createTenant();
    const p = await createMember({ tenantId: tenant, scope: 'all' });
    const q = await createMember({ tenantId: tenant, scope: 'all' });
    const r = await createMember({ tenantId: tenant, scope: 'all' });
    await storeKey(p);
    await storeKey(q);
    const pRow = (await rowOf(p.appUserId))[0];
    await harnessSql()`
      insert into public.user_ai_key (tenant_id, app_user_id, ciphertext, secret_version, last4)
      values (${tenant}::uuid, ${r.appUserId}::uuid, ${pRow.ciphertext}, 1, ${CANARY.slice(-4)})`;
    const rBefore = (await rowOf(r.appUserId))[0];
    clearSentryStubOutbox();

    const result = await rewrapStaleAiKeys({ env: { [ENV]: BOTH }, onlyTenantId: tenant });
    expect(result).toEqual({ rewrapped: 2, failed: 1 });

    const onlyV2 = parseEncryptionKeys({ [ENV]: `2:${K2}` });
    for (const who of [p, q]) {
      const row = (await rowOf(who.appUserId))[0];
      expect(row.secret_version, who.email).toBe(2);
      expect(
        decryptUserAiKey(
          { ciphertext: row.ciphertext, secretVersion: row.secret_version },
          { tenantId: tenant, appUserId: who.appUserId },
          onlyV2,
        ) === CANARY,
        who.email,
      ).toBe(true);
    }
    expect((await rowOf(r.appUserId))[0]).toEqual(rBefore);

    await Sentry.flush(2000);
    const events = eventsIn(readSentryStubOutbox());
    expect(events.map((e) => e.exception.values[0].value)).toEqual(['ai_key_undecryptable']);
  }, 120000);
});

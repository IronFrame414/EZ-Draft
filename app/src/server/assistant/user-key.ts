// EZD-5601 Step 13 (vault/plans/EZD-5601.md "D-POST order", "D-DELETE", "D-Responses", "D-Load", "D-Email";
// Q-0637 key storage and call path; Q-0638 rotation; AC-EZD-5601-1 to -7, -9, -10): add, remove and load the
// signed-in user's own Anthropic key. Every database call goes through the caller's session client and the
// *_my_ai_key definer functions, which take the user and the tenant from the claims. The key is never put in an
// Error, a report, a response or a log line; reports carry a code only.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  aiKeyShapeProblem,
  last4Of,
  normalizeAiKey,
  type AiKeyState,
} from '../../lib/profile/ai-key';
import { AiError, checkAnthropicKey, UserAiKey } from '../ai';
import type { Session } from '../auth/session';
import type { Database } from '../db/database.types';
import { sendEmail } from '../email/send';
import { appOrigin } from '../errors/app-origin';
import { reportError } from '../errors/report';
import { getT } from '../messages/get-t';
import {
  AiKeyConfigError,
  AiKeyDecryptError,
  decryptUserAiKey,
  encryptUserAiKey,
  parseEncryptionKeys,
  type EncryptionKeys,
} from './key-crypto';

type Env = Record<string, string | undefined>;

export type AddKeyResult =
  | { status: 200; last4: string }
  | {
      status: 400 | 403 | 429 | 500 | 502;
      code:
        | 'ai_key_invalid'
        | 'ai_key_refused'
        | 'ai_key_out_of_credit'
        | 'not_authorized'
        | 'ai_key_throttled'
        | 'ai_key_unavailable'
        | 'ai_key_check_failed';
    };

export type RemoveKeyResult = { status: 200 } | { status: 403; code: 'not_authorized' };

export type UserAiKeyLoad =
  { kind: 'none' } | { kind: 'key'; key: UserAiKey } | { kind: 'undecryptable' };

export type UserKeyDeps = {
  env?: Env;
  check?: typeof checkAnthropicKey;
  sendEmail?: typeof sendAiKeyEmail;
  signal?: AbortSignal;
  budgetMs?: number;
};

const ROUTE = '/api/profile/ai-key';
const LOAD_LOCATION = 'server/assistant/user-key';
const PRIVILEGE = '42501';

type RpcError = { code?: string } | null;

const isPrivilege = (error: RpcError) => error?.code === PRIVILEGE;

// Any other database error: a fixed message naming the function, never the database text.
// EZD-421: `cause` keeps the database error for the ended-session rule (server/auth/ended-session.ts).
const rpcFailure = (fn: string, cause?: unknown) => new Error(`${fn}_failed`, { cause });
// readMyKey's 'denied' is a 42501; kept as the cause so an ended session is told apart (EZD-421).
const DENIED = { code: '42501' } as const;

async function report(code: string, location: string): Promise<void> {
  await reportError(new Error(code), { source: 'function', location });
}

type KeyRow = {
  tenant_id: string | null;
  app_user_id: string | null;
  last4: string | null;
  secret_version: number | null;
  ciphertext: string | null;
};

// The caller's own key row (get_my_ai_key always answers one row). 'denied' on 42501.
async function readMyKey(client: SupabaseClient<Database>): Promise<KeyRow | 'denied'> {
  const { data, error } = await client.rpc('get_my_ai_key');
  if (isPrivilege(error)) return 'denied';
  if (error) throw rpcFailure('get_my_ai_key', error);
  const row = (data as KeyRow[] | null)?.[0];
  if (!row) throw rpcFailure('get_my_ai_key');
  return row;
}

export async function getMyAiKeyState(client: SupabaseClient<Database>): Promise<AiKeyState> {
  const row = await readMyKey(client);
  if (row === 'denied') throw rpcFailure('get_my_ai_key', DENIED);
  return row.last4 === null ? null : { last4: row.last4 };
}

export async function addUserAiKey(
  client: SupabaseClient<Database>,
  session: Session,
  rawKey: string,
  deps: UserKeyDeps = {},
): Promise<AddKeyResult> {
  const env = deps.env ?? process.env;
  const key = normalizeAiKey(rawKey);
  if (aiKeyShapeProblem(key) !== null) return { status: 400, code: 'ai_key_invalid' };

  let keys: EncryptionKeys;
  try {
    keys = parseEncryptionKeys(env);
  } catch (e) {
    if (!(e instanceof AiKeyConfigError)) throw e;
    await report(e.code, ROUTE);
    return { status: 500, code: 'ai_key_unavailable' };
  }

  const mine = await readMyKey(client);
  if (mine === 'denied' || mine.tenant_id === null || mine.app_user_id === null) {
    return { status: 403, code: 'not_authorized' };
  }
  const owner = { tenantId: mine.tenant_id, appUserId: mine.app_user_id };

  const slot = await client.rpc('take_ai_key_attempt');
  if (isPrivilege(slot.error)) return { status: 403, code: 'not_authorized' };
  if (slot.error) throw rpcFailure('take_ai_key_attempt', slot.error);
  if (slot.data !== true) return { status: 429, code: 'ai_key_throttled' };

  const check = deps.check ?? checkAnthropicKey;
  let result: Awaited<ReturnType<typeof checkAnthropicKey>>;
  try {
    result = await check(new UserAiKey(key), {
      ...(deps.env ? { env: deps.env } : {}),
      ...(deps.signal ? { signal: deps.signal } : {}),
      ...(deps.budgetMs === undefined ? {} : { budgetMs: deps.budgetMs }),
    });
  } catch (e) {
    if (!(e instanceof AiError)) throw e;
    await report(e.code, ROUTE);
    return { status: 500, code: 'ai_key_unavailable' };
  }
  if (result === 'refused') return { status: 400, code: 'ai_key_refused' };
  if (result === 'out_of_credit') return { status: 400, code: 'ai_key_out_of_credit' };
  if (result !== 'ok') return { status: 502, code: 'ai_key_check_failed' };

  const { ciphertext, secretVersion } = encryptUserAiKey(key, owner, keys);
  const last4 = last4Of(key);
  const saved = await client.rpc('save_my_ai_key', {
    p_tenant_id: owner.tenantId,
    p_app_user_id: owner.appUserId,
    p_ciphertext: ciphertext,
    p_secret_version: secretVersion,
    p_last4: last4,
  });
  if (isPrivilege(saved.error)) return { status: 403, code: 'not_authorized' };
  if (saved.error) throw rpcFailure('save_my_ai_key', saved.error);

  await (deps.sendEmail ?? sendAiKeyEmail)('added', session.email, last4, env);
  return { status: 200, last4 };
}

export async function removeUserAiKey(
  client: SupabaseClient<Database>,
  session: Session,
  deps: UserKeyDeps = {},
): Promise<RemoveKeyResult> {
  const { data, error } = await client.rpc('delete_my_ai_key');
  if (isPrivilege(error)) return { status: 403, code: 'not_authorized' };
  if (error) throw rpcFailure('delete_my_ai_key', error);
  const row = (data as { deleted: boolean; last4: string | null }[] | null)?.[0];
  if (row?.deleted && row.last4 !== null) {
    await (deps.sendEmail ?? sendAiKeyEmail)(
      'removed',
      session.email,
      row.last4,
      deps.env ?? process.env,
    );
  }
  return { status: 200 };
}

export async function loadUserAiKeyForCall(
  client: SupabaseClient<Database>,
  deps: UserKeyDeps = {},
): Promise<UserAiKeyLoad> {
  const row = await readMyKey(client);
  if (row === 'denied') throw rpcFailure('get_my_ai_key', DENIED);
  if (
    row.tenant_id === null ||
    row.app_user_id === null ||
    row.ciphertext === null ||
    row.secret_version === null
  ) {
    return { kind: 'none' };
  }
  const keys = parseEncryptionKeys(deps.env ?? process.env);
  const owner = { tenantId: row.tenant_id, appUserId: row.app_user_id };
  let plain: string;
  try {
    plain = decryptUserAiKey(
      { ciphertext: row.ciphertext, secretVersion: row.secret_version },
      owner,
      keys,
    );
  } catch (e) {
    if (!(e instanceof AiKeyDecryptError)) throw e;
    await report('ai_key_undecryptable', LOAD_LOCATION);
    return { kind: 'undecryptable' };
  }

  if (row.secret_version < keys.highest) {
    try {
      const { ciphertext, secretVersion } = encryptUserAiKey(plain, owner, keys);
      const { error } = await client.rpc('rewrap_my_ai_key', {
        p_old_version: row.secret_version,
        p_ciphertext: ciphertext,
        p_secret_version: secretVersion,
      });
      if (error) throw rpcFailure('rewrap_my_ai_key', error);
    } catch {
      await report('ai_key_rewrap_failed', LOAD_LOCATION);
    }
  }
  return { kind: 'key', key: new UserAiKey(plain) };
}

export async function sendAiKeyEmail(
  kind: 'added' | 'removed',
  to: string,
  last4: string,
  env: Env = process.env,
): Promise<void> {
  const t = getT('office', 'en');
  const subject =
    kind === 'added'
      ? t('office.profile.email_ai_key_added_subject')
      : t('office.profile.email_ai_key_removed_subject');
  const body =
    kind === 'added'
      ? t('office.profile.email_ai_key_added_body', { last4, email: to })
      : t('office.profile.email_ai_key_removed_body', { last4, email: to });
  try {
    await sendEmail(
      {
        to,
        sentBy: { email: to },
        subject,
        paragraphs: [body],
        link: { url: appOrigin(env), label: t('office.profile.email_link') },
        lang: 'en',
      },
      { env },
    );
  } catch {
    // sendEmail reports a failed send itself; a refused input is reported here, by code only.
    await reportError(new Error('profile_ai_key_email_failed'), {
      source: 'function',
      location: ROUTE,
    });
  }
}

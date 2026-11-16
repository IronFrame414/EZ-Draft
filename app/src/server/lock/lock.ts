// EZD-125 (S06 Edit lock; Q-0697 decisions 03 "Edit lock data", "Auto release", decisions 10 "Phase 8
// permissions"; 03b rule 6): the server side of the edit lock. Each call is one definer function under the
// member's session (supabase/migrations/20261116140001_create_edit_lock_functions.sql), which checks the
// switch, the scope and the holder again and writes the event_log row in the same transaction. Errors: 42501
// permission_denied, P0002 project_not_found, 22023 invalid_input; any other error is thrown.
import type { SupabaseClient } from '@supabase/supabase-js';
import { defaultRow } from '../../lib/defaults/registry';
import { effectiveDefaults, type StoredDefaults } from '../../lib/defaults/values';
import type { Database } from '../db/database.types';
import type { LockState, ReleaseReason } from '../../lib/lock/lock-client';

type Client = SupabaseClient<Database>;
type Refused = { ok: false; code: 'permission_denied' | 'project_not_found' | 'invalid_input' };

export type { LockState, PendingRequest, ReleaseReason } from '../../lib/lock/lock-client';

export type AcquireResult =
  | { ok: true; status: 'acquired'; lockEpoch: number; since: string }
  | { ok: true; status: 'held'; holderAppUserId: string; since: string; lockEpoch: number }
  | Refused;

export type ReleaseResult =
  | { ok: true; status: 'released'; lockEpoch: number }
  | { ok: true; status: 'not_holder' }
  | { ok: true; status: 'stale_lock_epoch' }
  | Refused;

export type RequestResult =
  | { ok: true; status: 'requested'; requestId: string; requestedAt: string; deadlineAt: string }
  | { ok: true; status: 'lock_free' }
  | { ok: true; status: 'own_lock' }
  | { ok: true; status: 'already_requested' }
  | Refused;

export type CancelResult =
  | { ok: true; status: 'cancelled'; requestId: string }
  | { ok: true; status: 'no_request' }
  | Refused;

export type RespondResult =
  | { ok: true; status: 'kept' | 'released'; lockEpoch: number }
  | { ok: true; status: 'not_holder' }
  | { ok: true; status: 'not_pending' }
  | Refused;

type Row = Record<string, unknown>;

function refused(error: { code?: string }): Refused {
  if (error.code === '42501') return { ok: false, code: 'permission_denied' };
  if (error.code === 'P0002') return { ok: false, code: 'project_not_found' };
  if (error.code === '22023') return { ok: false, code: 'invalid_input' };
  throw error;
}

async function call(
  client: Client,
  fn: string,
  args: Record<string, unknown>,
): Promise<Row | Refused> {
  const { data, error } = await (
    client.rpc as unknown as (
      f: string,
      a: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { code?: string } | null }>
  )(fn, args);
  if (error) return refused(error);
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${fn}_unexpected_result`);
  }
  return data as Row;
}

const isRefused = (r: Row | Refused): r is Refused => (r as Refused).ok === false;
const str = (v: unknown): string => {
  if (typeof v !== 'string') throw new Error('lock_unexpected_result');
  return v;
};
const num = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('lock_unexpected_result');
  return n;
};

export async function readLock(
  client: Client,
  projectId: string,
): Promise<{ ok: true; lock: LockState } | Refused> {
  const r = await call(client, 'read_edit_lock', { p_project: projectId });
  if (isRefused(r)) return r;
  const holderId = r.holder_app_user_id;
  const mine = r.my_request as Row | null;
  const requests = Array.isArray(r.requests) ? (r.requests as Row[]) : [];
  return {
    ok: true,
    lock: {
      lockEpoch: num(r.lock_epoch),
      holder:
        typeof holderId === 'string'
          ? { appUserId: holderId, name: typeof r.holder_name === 'string' ? r.holder_name : '' }
          : null,
      since: typeof r.since === 'string' ? r.since : null,
      offline: r.offline === true,
      myRequest:
        mine && typeof mine === 'object'
          ? {
              id: str(mine.id),
              requestedAt: str(mine.requested_at),
              deadlineAt: str(mine.deadline_at),
            }
          : null,
      requests: requests.map((q) => ({
        id: str(q.id),
        requesterAppUserId: str(q.requester_app_user_id),
        requesterName: typeof q.requester_name === 'string' ? q.requester_name : '',
        requestedAt: str(q.requested_at),
        deadlineAt: str(q.deadline_at),
      })),
      now: str(r.now),
    },
  };
}

export async function acquireLock(
  client: Client,
  projectId: string,
  deviceId: string | null,
  ip: string | null,
): Promise<AcquireResult> {
  const r = await call(client, 'acquire_edit_lock', {
    p_project: projectId,
    p_device_id: deviceId,
    p_ip: ip,
  });
  if (isRefused(r)) return r;
  if (r.status === 'acquired') {
    return { ok: true, status: 'acquired', lockEpoch: num(r.lock_epoch), since: str(r.since) };
  }
  if (r.status === 'held') {
    return {
      ok: true,
      status: 'held',
      holderAppUserId: str(r.holder_app_user_id),
      since: str(r.since),
      lockEpoch: num(r.lock_epoch),
    };
  }
  throw new Error('acquire_edit_lock_unexpected_result');
}

export async function releaseLock(
  client: Client,
  projectId: string,
  reason: ReleaseReason,
  lockEpoch: number | null,
  ip: string | null,
): Promise<ReleaseResult> {
  const r = await call(client, 'release_edit_lock', {
    p_project: projectId,
    p_reason: reason,
    p_lock_epoch: lockEpoch,
    p_ip: ip,
  });
  if (isRefused(r)) return r;
  if (r.status === 'released')
    return { ok: true, status: 'released', lockEpoch: num(r.lock_epoch) };
  if (r.status === 'not_holder') return { ok: true, status: 'not_holder' };
  if (r.status === 'stale_lock_epoch') return { ok: true, status: 'stale_lock_epoch' };
  throw new Error('release_edit_lock_unexpected_result');
}

export async function requestEdit(
  client: Client,
  projectId: string,
  minutes: number,
  ip: string | null,
): Promise<RequestResult> {
  const r = await call(client, 'request_edit_lock', {
    p_project: projectId,
    p_minutes: minutes,
    p_ip: ip,
  });
  if (isRefused(r)) return r;
  if (r.status === 'requested') {
    return {
      ok: true,
      status: 'requested',
      requestId: str(r.request_id),
      requestedAt: str(r.requested_at),
      deadlineAt: str(r.deadline_at),
    };
  }
  if (r.status === 'lock_free') return { ok: true, status: 'lock_free' };
  if (r.status === 'own_lock') return { ok: true, status: 'own_lock' };
  if (r.status === 'already_requested') return { ok: true, status: 'already_requested' };
  throw new Error('request_edit_lock_unexpected_result');
}

export async function cancelRequest(
  client: Client,
  projectId: string,
  ip: string | null,
): Promise<CancelResult> {
  const r = await call(client, 'cancel_edit_request', { p_project: projectId, p_ip: ip });
  if (isRefused(r)) return r;
  if (r.status === 'cancelled')
    return { ok: true, status: 'cancelled', requestId: str(r.request_id) };
  if (r.status === 'no_request') return { ok: true, status: 'no_request' };
  throw new Error('cancel_edit_request_unexpected_result');
}

export async function respondRequest(
  client: Client,
  projectId: string,
  requestId: string,
  response: 'release' | 'keep',
  ip: string | null,
): Promise<RespondResult> {
  const r = await call(client, 'respond_edit_request', {
    p_project: projectId,
    p_request: requestId,
    p_response: response,
    p_ip: ip,
  });
  if (isRefused(r)) return r;
  if (r.status === 'kept' || r.status === 'released') {
    return { ok: true, status: r.status, lockEpoch: num(r.lock_epoch) };
  }
  if (r.status === 'not_holder') return { ok: true, status: 'not_holder' };
  if (r.status === 'not_pending') return { ok: true, status: 'not_pending' };
  throw new Error('respond_edit_request_unexpected_result');
}

// The effective "Edit lock auto-release" minutes (S15d:45; Q-0188): the company's stored value, else the
// registry default. The one TypeScript registry is the only source of the default.
export function autoReleaseMinutes(stored: StoredDefaults): number {
  const value = effectiveDefaults(stored).edit_lock_auto_release;
  if (typeof value === 'number') return value;
  const fallback = defaultRow('edit_lock_auto_release')?.default;
  if (typeof fallback !== 'number') throw new Error('edit_lock_auto_release_missing');
  return fallback;
}

// The sweep's pass (service_role client): the number of locks auto-released.
export async function sweepEditLocks(db: Client): Promise<number> {
  const { data, error } = await (
    db.rpc as unknown as (f: string) => PromiseLike<{ data: unknown; error: unknown }>
  )('sweep_edit_locks');
  if (error) throw new Error('edit_lock_sweep_failed');
  return Number(data ?? 0);
}

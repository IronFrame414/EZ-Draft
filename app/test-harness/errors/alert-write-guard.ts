// EZD-252 (vault/plans/EZD-252.md sections 1 and 3; Q-0385 (a)): the error-alert write guard. Every app Vitest file
// gets a random token (D2); the fetch wrapper sends it as x-ezd-test-file on every request to the local Supabase
// origin; holdErrorAlertLock() names its lock connection `ezd-alert-lock <token>`; the local-only row trigger on
// public.error_alert refuses a tagged write unless a backend with that name holds advisory lock 9024 (D1), and the
// wrapper records the refusal so the setup file fails the test file (D3). State lives on globalThis by
// Symbol.for, as in test-harness/net-guard/net-guard.mjs, so every copy of this module sees one state.
import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import { GUARD_MARKER } from '../net-guard/net-guard.mjs';

export const ALERT_WRITE_TAG_HEADER = 'x-ezd-test-file';
export const ALERT_LOCK_APP_NAME_PREFIX = 'ezd-alert-lock ';
export const ALERT_WRITE_GUARD_SQLSTATE = 'EZ252';
export const ALERT_WRITE_GUARD_TRIGGER = 'ezd_test_alert_write_guard';
export const ALERT_WRITE_GUARD_INSTALL_LOCK_KEY = 9252;
export const ALERT_WRITE_GUARD_MARKER = Symbol.for('ezd.alertWriteGuard.installed');
const STATE_KEY = Symbol.for('ezd.alertWriteGuard.state');

export type AlertWriteViolation = { method: string; path: string; at: number };

export type AlertWriteGuardState = {
  token: string;
  violations: AlertWriteViolation[];
  inFlight: Set<Promise<unknown>>;
};

type GlobalWithState = typeof globalThis & { [STATE_KEY]?: AlertWriteGuardState };

export function newAlertWriteGuardState(): AlertWriteGuardState {
  return { token: randomUUID(), violations: [], inFlight: new Set() };
}

export function alertWriteGuardState(): AlertWriteGuardState {
  const g = globalThis as GlobalWithState;
  g[STATE_KEY] ??= newAlertWriteGuardState();
  return g[STATE_KEY];
}

export function resetAlertWriteGuardState(): AlertWriteGuardState {
  const s = newAlertWriteGuardState();
  (globalThis as GlobalWithState)[STATE_KEY] = s;
  return s;
}

export function alertWriteViolationMessage(v: AlertWriteViolation[]): string {
  const entries = [...new Set(v.map((x) => `${x.method} ${x.path}`))].join(', ');
  return `error_alert written without holdErrorAlertLock: ${entries}`;
}

// S1 (section 3): the trigger function and trigger. An AFTER row trigger's return value is ignored.
export function alertWriteGuardSql(lockKey: number): string {
  if (!Number.isInteger(lockKey))
    throw new Error(`alertWriteGuardSql: lockKey must be an integer: ${lockKey}`);
  return [
    'create schema if not exists ezd_test;',
    `create or replace function ezd_test.alert_write_guard() returns trigger language plpgsql security definer set search_path = '' as $$ declare v_tag text := nullif(current_setting('request.headers', true), '')::json ->> '${ALERT_WRITE_TAG_HEADER}'; begin if v_tag is null then return null; end if; if not exists (select 1 from pg_catalog.pg_locks l join pg_catalog.pg_stat_activity a on a.pid = l.pid where l.locktype = 'advisory' and l.classid = 0::oid and l.objid = ${lockKey}::oid and l.objsubid = 1 and l.granted and a.application_name = '${ALERT_LOCK_APP_NAME_PREFIX}' || v_tag) then raise exception 'error_alert_write_without_lock' using errcode = '${ALERT_WRITE_GUARD_SQLSTATE}'; end if; return null; end $$;`,
    `create or replace trigger ${ALERT_WRITE_GUARD_TRIGGER} after insert or update or delete on public.error_alert for each row execute function ezd_test.alert_write_guard();`,
  ].join('\n');
}

// Install concurrency (section 1, Decided): two gates may start together (Q-0384).
export async function installAlertWriteGuardSql(sql: Sql, lockKey: number): Promise<void> {
  const text = alertWriteGuardSql(lockKey);
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${ALERT_WRITE_GUARD_INSTALL_LOCK_KEY})`;
    await tx.unsafe(text);
  });
}

function urlOf(input: RequestInfo | URL): URL | null {
  try {
    if (input instanceof URL) return input;
    if (typeof input === 'string') return new URL(input);
    if (input instanceof Request) return new URL(input.url);
  } catch {
    // Not an absolute URL: the next fetch decides.
  }
  return null;
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  const m = init?.method ?? (input instanceof Request ? input.method : undefined) ?? 'GET';
  return m.toUpperCase();
}

export function createAlertWriteGuardFetch(
  next: typeof fetch,
  supabaseOrigin: string,
  state?: AlertWriteGuardState,
): typeof fetch {
  const wrapped = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = urlOf(input);
    if (!url || url.origin !== supabaseOrigin) return next(input, init);
    const s = state ?? alertWriteGuardState();
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    headers.set(ALERT_WRITE_TAG_HEADER, s.token);
    const method = methodOf(input, init);
    const call = (async () => {
      const res = await next(input, { ...init, headers });
      if (!res.ok && (res.headers.get('content-type') ?? '').includes('json')) {
        try {
          const body = (await res.clone().json()) as { code?: unknown } | null;
          if (body?.code === ALERT_WRITE_GUARD_SQLSTATE) {
            s.violations.push({ method, path: url.pathname, at: Date.now() });
          }
        } catch {
          // A body that is not JSON is ignored.
        }
      }
      return res;
    })();
    s.inFlight.add(call);
    const settle = () => {
      s.inFlight.delete(call);
    };
    call.then(settle, settle);
    return call;
  };
  Object.defineProperty(wrapped, ALERT_WRITE_GUARD_MARKER, { value: true });
  Object.defineProperty(wrapped, GUARD_MARKER, { value: true });
  return wrapped as typeof fetch;
}

export function installAlertWriteFetchGuard(supabaseOrigin: string): void {
  const current = globalThis.fetch as typeof fetch & { [ALERT_WRITE_GUARD_MARKER]?: boolean };
  if (current[ALERT_WRITE_GUARD_MARKER]) return;
  globalThis.fetch = createAlertWriteGuardFetch(globalThis.fetch, supabaseOrigin);
}

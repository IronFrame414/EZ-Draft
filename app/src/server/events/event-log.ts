// EZD-109 (vault/plans/EZD-109.md Build step 5; Q-0695 decisions 03 row 33; Q-0735 (a)): the event log rule for
// every registered event and the default sink that writes the `sink` ones. Permission, role, membership,
// scope and invite changes are `transaction`: their definer function writes the row inside the change's own
// transaction (supabase/migrations/*event_log*.sql), so the sink skips them. Every other event is written
// here after the action has committed, through public.log_event under the signed-in person's session; a
// failed write is reported and never thrown, so the action stands.
import type { SupabaseClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { isIPv4, isIPv6 } from 'node:net';
import { createSessionClient } from '../auth/supabase-server';
import type { Database, Json } from '../db/database.types';
import { reportError } from '../errors/report';
import type { EventName } from '../../lib/events/registry';
import type { EmittedEvent, EventSink } from './emit';

export type EventLogMode = 'sink' | 'transaction' | 'none';

export type EventObjectType =
  | 'tenant'
  | 'project'
  | 'customer'
  | 'model_object'
  | 'app_user'
  | 'membership'
  | 'role'
  | 'library_item';

export type EventLogObject = { type: EventObjectType; id: string };

export type EventLogRule<N extends EventName> =
  | { mode: 'sink'; object: (event: EmittedEvent<N>) => EventLogObject }
  | { mode: 'transaction' }
  | { mode: 'none' };

export type EventLogRules = { readonly [N in EventName]: EventLogRule<N> };

// The same text as the event_log.action check (20261113140000_create_event_log.sql).
export const EVENT_ACTION_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
export const EVENT_ACTION_MAX = 64;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function projectOrTenant(event: EmittedEvent<EventName>): EventLogObject {
  return event.projectId !== null
    ? { type: 'project', id: event.projectId }
    : { type: 'tenant', id: event.tenantId };
}

const SINK = { mode: 'sink', object: projectOrTenant } as const;
const TRANSACTION = { mode: 'transaction' } as const;

// One entry per EVENTS key, in EVENTS order. A new event fails typecheck until it has one; the ticket that
// narrows an event's payload sets its object.
export const EVENT_LOG: EventLogRules = {
  'plan_set.issued': SINK,
  'selection.approved': SINK,
  'revision.created': SINK,
  'change_order.sent': SINK,
  'takeoff.updated': SINK,
  'model.exported': SINK,
  'field_task.completed': SINK,
  'field.conflict_flagged': SINK,
  'client.commented': SINK,
  'customer.synced': SINK,
  'user.synced': SINK,
  'render_allowance.refilled': SINK,
  // EZD-125 writes these in the lock transaction and makes them `transaction` (Q-0697).
  'lock.acquired': SINK,
  'lock.released': SINK,
  'lock.requested': SINK,
  'lock.auto_released': SINK,
  'lock.request_declined': SINK,
  'lock.conflict': SINK,
  // Q-0735 (a): an autosave writes no row.
  'model.saved': { mode: 'none' },
  'import.completed': SINK,
  'import.ready': SINK,
  'reference.version_uploaded': SINK,
  'render.completed': SINK,
  'render.failed': SINK,
  'render.approved': SINK,
  'render.client_ready': SINK,
  'render.rejected': SINK,
  'render.model_changed': SINK,
  'render.outdated': SINK,
  'render.hidden_from_client': SINK,
  'translation.created': SINK,
  'translation.approved': SINK,
  'field.measurement_submitted': SINK,
  'field.measurement_approved': SINK,
  'field.measurement_rejected': SINK,
  'field.measure_sent': SINK,
  'field_pack.issued': SINK,
  'share_link.expiring': SINK,
  'cleanup.due': SINK,
  'code_check.completed': SINK,
  'design_option.created': SINK,
  'design_option.updated': SINK,
  'version.sent': SINK,
  'version.snapshot_named': SINK,
  'version.reverted': SINK,
  'cleanup.deleted': SINK,
  'room.closure_overridden': {
    mode: 'sink',
    object: (e) => ({ type: 'model_object', id: e.payload.roomId }),
  },
  'catalog_item.created': SINK,
  'detail.placed': SINK,
  // Written by link_app_user and accept_invite in the acceptance transaction.
  'user.joined': TRANSACTION,
  'tenant.updated': { mode: 'sink', object: (e) => ({ type: 'tenant', id: e.tenantId }) },
  'customer.created': {
    mode: 'sink',
    object: (e) => ({ type: 'customer', id: e.payload.customerId }),
  },
  'customer.updated': {
    mode: 'sink',
    object: (e) => ({ type: 'customer', id: e.payload.customerId }),
  },
  'project.created': {
    mode: 'sink',
    object: (e) => ({ type: 'project', id: e.payload.projectId }),
  },
  'import.started': {
    mode: 'sink',
    object: (e) => ({ type: 'project', id: e.payload.projectId }),
  },
  'user.language_changed': {
    mode: 'sink',
    object: (e) => ({ type: 'app_user', id: e.payload.appUserId }),
  },
  // Written by the member and role definer functions in the change's transaction
  // (20261113140003_member_and_role_event_log.sql).
  'user_permission.updated': TRANSACTION,
  'user.deactivated': TRANSACTION,
  'user.reactivated': TRANSACTION,
  'user.removed': TRANSACTION,
  // Written by the invite definer functions (20261113150001_create_invite_functions.sql).
  'user.invited': TRANSACTION,
  'user.invite_resent': TRANSACTION,
  'user.invite_cancelled': TRANSACTION,
  'role.created': TRANSACTION,
  'role.updated': TRANSACTION,
  'role.deleted': TRANSACTION,
  // Written by save_member_scope and create_project (20261113160000, 20261113160001).
  'user.scope_changed': TRANSACTION,
  // EZD-131: written after the library route's write commits.
  'library.item_created': {
    mode: 'sink',
    object: (e) => ({ type: 'library_item', id: e.payload.itemId }),
  },
  'library.item_updated': {
    mode: 'sink',
    object: (e) => ({ type: 'library_item', id: e.payload.itemId }),
  },
  'library.item_deleted': {
    mode: 'sink',
    object: (e) => ({ type: 'library_item', id: e.payload.itemId }),
  },
};

// The first x-forwarded-for entry when it is one IPv4 or IPv6 address (no port, brackets or zone id), else
// null. Never the throttle's /64 key (Q-0695). Always castable to inet.
export function eventLogIp(h: Headers): string | null {
  const raw = h.get('x-forwarded-for');
  if (raw === null) return null;
  const first = (raw.split(',')[0] ?? '').trim();
  if (first === '' || first.includes('%')) return null;
  if (!isIPv4(first) && !isIPv6(first)) return null;
  return first;
}

// The request's client address; null outside a request.
export async function requestIp(): Promise<string | null> {
  try {
    return eventLogIp(await headers());
  } catch {
    return null;
  }
}

export type EventLogSinkDeps = {
  client?: () => SupabaseClient<Database>;
  requestIp?: () => Promise<string | null>;
  report?: typeof reportError;
  rules?: EventLogRules;
};

// Sound because emit builds event.name and event.payload from one call, so a rule only sees its own event.
function ruleFor(rules: EventLogRules, name: EventName): EventLogRule<EventName> {
  return rules[name] as unknown as EventLogRule<EventName>;
}

export function createEventLogSink(deps: EventLogSinkDeps = {}): EventSink {
  const client = deps.client ?? (() => createSessionClient());
  const ip = deps.requestIp ?? requestIp;
  const report = deps.report ?? reportError;
  const rules = deps.rules ?? EVENT_LOG;

  const fail = async (event: EmittedEvent<EventName>, code: string, cause: string) => {
    try {
      await report(new Error(code), {
        source: 'function',
        location: 'events.event_log',
        tags: { 'ezd.event': event.name, 'ezd.cause': cause },
      });
    } catch {
      /* reportError never throws; guarded so the sink never does either */
    }
  };

  return async (event) => {
    const rule = ruleFor(rules, event.name);
    if (rule.mode !== 'sink') return;
    try {
      const object = rule.object(event);
      if (!UUID.test(object.id)) {
        await fail(event, 'event_log_object_invalid', 'object_id');
        return;
      }
      const address = await ip();
      const { error } = await client().rpc('log_event', {
        p_tenant_id: event.tenantId,
        p_action: event.name,
        p_object_type: object.type,
        p_object_id: object.id,
        p_details: event.payload as Json,
        // p_ip takes null when there is no client address; the generated argument types do not say so.
        p_ip: address as string,
      });
      if (error) await fail(event, 'event_log_write_failed', error.code || 'unknown');
    } catch {
      await fail(event, 'event_log_write_failed', 'thrown');
    }
  };
}

export const eventLogSink: EventSink = createEventLogSink();

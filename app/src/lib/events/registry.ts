import type { CustomerEventField } from '../customers/customers';

export type EventKind = 'webhook' | 'internal' | 'log_only';

export const EVENTS = {
  // Outbound webhooks to EZ Binder, and Added in Round 24 under Delivery rules (07 Hooks)
  'plan_set.issued': { kind: 'webhook' },
  'selection.approved': { kind: 'webhook' },
  'revision.created': { kind: 'webhook' },
  'change_order.sent': { kind: 'webhook' },
  'takeoff.updated': { kind: 'webhook' },
  'model.exported': { kind: 'webhook' },
  'field_task.completed': { kind: 'webhook' },
  'field.conflict_flagged': { kind: 'webhook' },
  'client.commented': { kind: 'webhook' },
  'customer.synced': { kind: 'webhook' },
  'user.synced': { kind: 'webhook' },
  'render_allowance.refilled': { kind: 'webhook' },
  // Internal app events (07 Hooks)
  'lock.acquired': { kind: 'internal' },
  'lock.released': { kind: 'internal' },
  'lock.requested': { kind: 'internal' },
  'lock.auto_released': { kind: 'internal' },
  'lock.request_declined': { kind: 'internal' },
  'lock.conflict': { kind: 'internal' },
  'model.saved': { kind: 'internal' },
  'import.completed': { kind: 'internal' },
  'import.ready': { kind: 'internal' },
  'reference.version_uploaded': { kind: 'internal' },
  'render.completed': { kind: 'internal' },
  'render.failed': { kind: 'internal' },
  'render.approved': { kind: 'internal' },
  'render.client_ready': { kind: 'internal' },
  'render.rejected': { kind: 'internal' },
  'render.model_changed': { kind: 'internal' },
  'render.outdated': { kind: 'internal' },
  'render.hidden_from_client': { kind: 'internal' },
  'translation.created': { kind: 'internal' },
  'translation.approved': { kind: 'internal' },
  'field.measurement_submitted': { kind: 'internal' },
  'field.measurement_approved': { kind: 'internal' },
  'field.measurement_rejected': { kind: 'internal' },
  'field.measure_sent': { kind: 'internal' },
  'field_pack.issued': { kind: 'internal' },
  'share_link.expiring': { kind: 'internal' },
  'cleanup.due': { kind: 'internal' },
  'code_check.completed': { kind: 'internal' },
  'design_option.created': { kind: 'internal' },
  'design_option.updated': { kind: 'internal' },
  'version.sent': { kind: 'internal' },
  'version.snapshot_named': { kind: 'internal' },
  'version.reverted': { kind: 'internal' },
  'cleanup.deleted': { kind: 'internal' },
  // Canonical names: screen events that write the event log only (07 Hooks)
  'catalog_item.created': { kind: 'log_only' },
  'detail.placed': { kind: 'log_only' },
  'user.joined': { kind: 'log_only' },
  'tenant.updated': { kind: 'log_only' },
  'customer.created': { kind: 'log_only' },
  'customer.updated': { kind: 'log_only' },
} as const satisfies Record<string, { kind: EventKind }>;

export type EventName = keyof typeof EVENTS;

// EZD-112: the company identity fields a `tenant.updated` event names (S15a Events).
export type TenantField = 'name' | 'logo' | 'license_no' | 'contact';

export function isRegisteredEvent(name: string): name is EventName {
  return Object.hasOwn(EVENTS, name);
}

// Each emitting ticket narrows its own entry here.
export interface EventPayloads {
  'plan_set.issued': Record<string, unknown>;
  'selection.approved': Record<string, unknown>;
  'revision.created': Record<string, unknown>;
  'change_order.sent': Record<string, unknown>;
  'takeoff.updated': Record<string, unknown>;
  'model.exported': Record<string, unknown>;
  'field_task.completed': Record<string, unknown>;
  'field.conflict_flagged': Record<string, unknown>;
  'client.commented': Record<string, unknown>;
  'customer.synced': Record<string, unknown>;
  'user.synced': Record<string, unknown>;
  'render_allowance.refilled': Record<string, unknown>;
  'lock.acquired': Record<string, unknown>;
  'lock.released': Record<string, unknown>;
  'lock.requested': Record<string, unknown>;
  'lock.auto_released': Record<string, unknown>;
  'lock.request_declined': Record<string, unknown>;
  'lock.conflict': Record<string, unknown>;
  'model.saved': Record<string, unknown>;
  'import.completed': Record<string, unknown>;
  'import.ready': Record<string, unknown>;
  'reference.version_uploaded': Record<string, unknown>;
  'render.completed': Record<string, unknown>;
  'render.failed': Record<string, unknown>;
  'render.approved': Record<string, unknown>;
  'render.client_ready': Record<string, unknown>;
  'render.rejected': Record<string, unknown>;
  'render.model_changed': Record<string, unknown>;
  'render.outdated': Record<string, unknown>;
  'render.hidden_from_client': Record<string, unknown>;
  'translation.created': Record<string, unknown>;
  'translation.approved': Record<string, unknown>;
  'field.measurement_submitted': Record<string, unknown>;
  'field.measurement_approved': Record<string, unknown>;
  'field.measurement_rejected': Record<string, unknown>;
  'field.measure_sent': Record<string, unknown>;
  'field_pack.issued': Record<string, unknown>;
  'share_link.expiring': Record<string, unknown>;
  'cleanup.due': Record<string, unknown>;
  'code_check.completed': Record<string, unknown>;
  'design_option.created': Record<string, unknown>;
  'design_option.updated': Record<string, unknown>;
  'version.sent': Record<string, unknown>;
  'version.snapshot_named': Record<string, unknown>;
  'version.reverted': Record<string, unknown>;
  'cleanup.deleted': Record<string, unknown>;
  'catalog_item.created': Record<string, unknown>;
  'detail.placed': Record<string, unknown>;
  'user.joined': { membershipId: string; appUserId: string; via: 'sign_in' | 'invite_link' };
  'tenant.updated': { fields: TenantField[] };
  'customer.created': { customerId: string };
  'customer.updated': { customerId: string; fields: CustomerEventField[] };
}

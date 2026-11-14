import type { CustomerEventField } from '../customers/customers';
import type { LibraryKind } from '../libraries/libraries';
import type { Language } from '../profile/profile';
import type { PermissionKey } from '../permissions/catalog';

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
  'room.closure_overridden': { kind: 'internal' },
  // Canonical names: screen events that write the event log only (07 Hooks)
  'catalog_item.created': { kind: 'log_only' },
  'detail.placed': { kind: 'log_only' },
  'user.joined': { kind: 'log_only' },
  'tenant.updated': { kind: 'log_only' },
  'customer.created': { kind: 'log_only' },
  'customer.updated': { kind: 'log_only' },
  'project.created': { kind: 'log_only' },
  // EZD-301 (S01 Events emitted): the Upload step's files are stored and the import begins.
  'import.started': { kind: 'log_only' },
  'user.language_changed': { kind: 'log_only' },
  // EZD-106 (S15 Events emitted; Q-0706 decisions 03 row 50): the Users page member writes.
  'user_permission.updated': { kind: 'log_only' },
  'user.deactivated': { kind: 'log_only' },
  'user.reactivated': { kind: 'log_only' },
  'user.removed': { kind: 'log_only' },
  // EZD-105 (S15 Events emitted; Q-0695 decisions 03 row 33): the invite writes.
  'user.invited': { kind: 'log_only' },
  'user.invite_resent': { kind: 'log_only' },
  'user.invite_cancelled': { kind: 'log_only' },
  // EZD-107 (S15 Events emitted; Q-0695 decisions 03 row 33): custom role writes.
  'role.created': { kind: 'log_only' },
  'role.updated': { kind: 'log_only' },
  'role.deleted': { kind: 'log_only' },
  // EZD-129 (S15 Decision 13; Q-0202; Q-0695 decisions 03 row 33): a member's Project access changed.
  'user.scope_changed': { kind: 'log_only' },
  // EZD-131 (S15h Events emitted): Settings > Libraries writes.
  'library.item_created': { kind: 'log_only' },
  'library.item_updated': { kind: 'log_only' },
  'library.item_deleted': { kind: 'log_only' },
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
  // EZD-120a Build step 5: the ids of the objects one save wrote.
  'model.saved': { objectIds: string[] };
  'import.completed': Record<string, unknown>;
  // EZD-302: the import sessions one detection run wrote and what they hold (07 import.ready; S02 summary).
  'import.ready': {
    projectId: string;
    importSessionIds: string[];
    counts: { walls: number; openings: number; rooms: number };
  };
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
  'room.closure_overridden': { roomId: string; gapIn: number; userId: string };
  'catalog_item.created': Record<string, unknown>;
  'detail.placed': Record<string, unknown>;
  'user.joined': { membershipId: string; appUserId: string; via: 'sign_in' | 'invite_link' };
  'tenant.updated': { fields: TenantField[] };
  'customer.created': { customerId: string };
  'customer.updated': { customerId: string; fields: CustomerEventField[] };
  // EZD-118 Build step 8: no `ezbinderJobId` (Q-0190); `source` only `standalone` (Q-0398).
  // EZD-301: `file` when the project starts from a file (S01 Events emitted).
  'project.created': { projectId: string; source: 'standalone' | 'file' };
  'import.started': { projectId: string; sourceFileIds: string[] };
  'user.language_changed': { appUserId: string; language: Language };
  // EZD-106: one Save on the Users page inspector (S15: user id, changed permissions, role, actor).
  'user_permission.updated': {
    membershipId: string;
    appUserId: string;
    changedKeys: PermissionKey[];
    roleId: string;
    roleChanged: boolean;
  };
  'user.deactivated': { membershipId: string; appUserId: string };
  'user.reactivated': { membershipId: string; appUserId: string };
  'user.removed': { membershipId: string; appUserId: string };
  // EZD-105: the invited membership (S15 Events emitted).
  'user.invited': {
    membershipId: string;
    appUserId: string;
    roleId: string;
    scope: 'all' | 'listed';
  };
  'user.invite_resent': { membershipId: string; appUserId: string };
  'user.invite_cancelled': { membershipId: string; appUserId: string };
  // EZD-107: the role and what changed (S15 Events emitted; event_log object role).
  'role.created': { roleId: string; name: string };
  'role.updated': { roleId: string; fields: ('name' | 'default_permissions')[] };
  'role.deleted': { roleId: string; name: string };
  'user.scope_changed': {
    membershipId: string;
    appUserId: string;
    oldScope: 'all' | 'listed';
    scope: 'all' | 'listed';
    added: string[];
    removed: string[];
  };
  // EZD-131: the library item and what changed.
  'library.item_created': { itemId: string; kind: LibraryKind };
  'library.item_updated': { itemId: string; kind: LibraryKind; fields: ('name' | 'data')[] };
  'library.item_deleted': { itemId: string; kind: LibraryKind; name: string };
}

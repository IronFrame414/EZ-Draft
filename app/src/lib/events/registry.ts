import type { CustomerEventField } from '../customers/customers';
import type { LibraryKind } from '../libraries/libraries';
import type { Language } from '../profile/profile';
import type { PermissionKey } from '../permissions/catalog';

// EZD-1009 (S07 Events emitted; vault/build/assumptions.md EZD-1009 "When the events fire").
export type DesignOptionEvent = {
  optionId: string;
  groupId: string;
  label: 'A' | 'B' | 'C';
  status: 'draft' | 'sent' | 'approved' | 'archived';
};

export type EventKind = 'webhook' | 'internal' | 'log_only';

// EZD-1314 (07 Hooks, Canonical names): a name no code emits yet carries `later` (the ticket in tickets.json that
// will emit it; that ticket removes the mark) or `notInV1` (the decision that keeps it out of v1). A name with an
// emitter carries neither. `registry-audit.test.ts` checks all three.
export type EventEntry = { kind: EventKind; later?: `EZD-${string}`; notInV1?: `Q-${string}` };

export const EVENTS = {
  // Outbound webhooks to EZ Binder, and Added in Round 24 under Delivery rules (07 Hooks)
  // EZD-717: written to the event log by public.issue_permit_set; delivery to EZ Binder stays out of v1 (Q-0190).
  'plan_set.issued': { kind: 'webhook' },
  'selection.approved': { kind: 'webhook', later: 'EZD-1211' },
  'revision.created': { kind: 'webhook', later: 'EZD-718' },
  'change_order.sent': { kind: 'webhook', notInV1: 'Q-0190' },
  'takeoff.updated': { kind: 'webhook', later: 'EZD-1611c' },
  'model.exported': { kind: 'webhook', later: 'EZD-1014' },
  // EZD-1409 (07 field_task.completed "task, room, photos, by, at"): a task checked off on a phone, once synced.
  'field_task.completed': { kind: 'webhook' },
  'field.conflict_flagged': { kind: 'webhook', later: 'EZD-1407' },
  'client.commented': { kind: 'webhook', later: 'EZD-1204' },
  'customer.synced': { kind: 'webhook', notInV1: 'Q-0190' },
  'user.synced': { kind: 'webhook', notInV1: 'Q-0190' },
  'render_allowance.refilled': { kind: 'webhook', later: 'EZD-1117' },
  // Internal app events (07 Hooks)
  'lock.acquired': { kind: 'internal' },
  'lock.released': { kind: 'internal' },
  'lock.requested': { kind: 'internal' },
  'lock.auto_released': { kind: 'internal' },
  'lock.request_declined': { kind: 'internal' },
  'lock.conflict': { kind: 'internal', later: 'EZD-1403' },
  'model.saved': { kind: 'internal' },
  'import.completed': { kind: 'internal' },
  'import.ready': { kind: 'internal' },
  'reference.version_uploaded': { kind: 'internal', later: 'EZD-908' },
  'render.completed': { kind: 'internal', later: 'EZD-1110' },
  'render.failed': { kind: 'internal', later: 'EZD-1110' },
  'render.approved': { kind: 'internal', later: 'EZD-1114' },
  'render.client_ready': { kind: 'internal', later: 'EZD-1114' },
  'render.rejected': { kind: 'internal', later: 'EZD-1114' },
  'render.model_changed': { kind: 'internal', later: 'EZD-1115' },
  'render.outdated': { kind: 'internal', later: 'EZD-1115' },
  'render.hidden_from_client': { kind: 'internal', later: 'EZD-1114' },
  'translation.created': { kind: 'internal', later: 'EZD-1502' },
  'translation.approved': { kind: 'internal', notInV1: 'Q-0234' },
  'field.measurement_submitted': { kind: 'internal', later: 'EZD-1407' },
  'field.measurement_approved': { kind: 'internal', later: 'EZD-1413' },
  'field.measurement_rejected': { kind: 'internal', later: 'EZD-1413' },
  'field.measure_sent': { kind: 'internal' },
  'field_pack.issued': { kind: 'internal', later: 'EZD-1421' },
  // EZD-1402 (phase-14 EZD-1402 "offline_change.synced"): a queued field action recorded on reconnect.
  'offline_change.synced': { kind: 'internal' },
  // EZD-1201 (07 share_link.expiring): written as the event_log row by sweep_share_link_reminders.
  'share_link.expiring': { kind: 'internal' },
  // EZD-123 (S20 Events emitted): written as event_log rows by run_version_cleanup and save_cleanup_choices.
  'cleanup.due': { kind: 'internal' },
  // EZD-612 (07 code_check.completed "with warning count"; assumptions EZD-611a, EZD-612 events row): a Check run,
  // and one warning accepted with a note (ids only, never the note).
  'code_check.completed': { kind: 'internal' },
  'code_warning.accepted': { kind: 'internal' },
  'design_option.created': { kind: 'internal' },
  'design_option.updated': { kind: 'internal' },
  'version.sent': { kind: 'internal' },
  'version.snapshot_named': { kind: 'internal' },
  'version.reverted': { kind: 'internal' },
  'cleanup.deleted': { kind: 'internal' },
  'room.closure_overridden': { kind: 'internal' },
  // EZD-5605 (Q-0638 gap 11; S03c "Accepted changes are marked as AI in the event log"): an Assistant change the
  // user accepted, saved through the objects route; ids and count only, never prompt or reply text.
  'model.ai_change_accepted': { kind: 'internal' },
  // EZD-215 (07 Q-0708; phase-02.md:33): a saved "Engineer required" note is new, or its "Engineer letter on file"
  // was ticked.
  'wall.engineer_required': { kind: 'internal' },
  'wall.engineer_note_attached': { kind: 'internal' },
  // Canonical names: screen events that write the event log only (07 Hooks)
  'catalog_item.created': { kind: 'log_only', later: 'EZD-1606' },
  'detail.placed': { kind: 'log_only', later: 'EZD-810' },
  'user.joined': { kind: 'log_only' },
  'tenant.updated': { kind: 'log_only' },
  // EZD-116 (S15d Events emitted): Settings > Defaults saved; the keys whose stored value changed.
  'tenant.defaults_updated': { kind: 'log_only' },
  // EZD-613 (S15g Events emitted): Settings > Code edition saved; what changed.
  'tenant.code_edition_updated': { kind: 'log_only' },
  // EZD-709 (S15b Events emitted "tenant.title_block_updated (new)"): Settings > Title block saved.
  'tenant.title_block_updated': { kind: 'log_only' },
  // EZD-708c (S06 Events emitted "sheet.updated (new) on Add to E2.0"): Add to E2.0 or Update E2.0 placed a panel's
  // schedule and load calc on the panel sheet; the sheet's number and the panel.
  'sheet.updated': { kind: 'log_only' },
  // EZD-614 (S15e Events emitted "catalog.settings_updated (new)"): Settings > Catalog saved (the Appliance rating
  // defaults card); the appliance types added, changed or removed.
  'catalog.settings_updated': { kind: 'log_only' },
  // EZD-1102 (S15f Events emitted "render.model_config_updated (new)"): Settings > Render models saved.
  'render.model_config_updated': { kind: 'log_only' },
  // EZD-125 (Q-0697 decisions 10): Cancel request; written as the event_log row by cancel_edit_request.
  'lock.request_cancelled': { kind: 'log_only' },
  // EZD-712 (S15c Events emitted): Settings > Sheet presets.
  'submittal_profile.created': { kind: 'log_only' },
  'submittal_profile.updated': { kind: 'log_only' },
  'submittal_profile.deleted': { kind: 'log_only' },
  'customer.created': { kind: 'log_only' },
  'customer.updated': { kind: 'log_only' },
  'project.created': { kind: 'log_only' },
  // EZD-711 (phase-07 EZD-711 "property_record.imported"): a member saved the confirmed appraiser fields.
  'property_record.imported': { kind: 'log_only' },
  // EZD-130 (Q-0697 decisions 03): Project settings saved; the changed keys.
  'project.updated': { kind: 'log_only' },
  // EZD-124 (Q-0708; Q-0700 decisions 03): the card menu's writes. Written only as the event_log row inside each
  // definer function (project.deleted in the delete's own transaction); never emitted.
  'project.renamed': { kind: 'log_only' },
  'project.status_changed': { kind: 'log_only' },
  'project.archived': { kind: 'log_only' },
  'project.restored': { kind: 'log_only' },
  'project.deleted': { kind: 'log_only' },
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
  // EZD-105b (Q-0096 P7; Q-0695 decisions 03 row 33): an Owner set a member's password. Written only as the
  // event_log row inside record_member_password_set; never emitted.
  'user.password_set': { kind: 'log_only' },
  // EZD-131 (S15h Events emitted): Settings > Libraries writes.
  'library.item_created': { kind: 'log_only' },
  'library.item_updated': { kind: 'log_only' },
  'library.item_deleted': { kind: 'log_only' },
  // EZD-313 (S02 Events emitted "import.cancelled (new)"): Cancel import discarded an import's detected items.
  'import.cancelled': { kind: 'log_only' },
  // EZD-409 (S04 Events emitted "cabinet_schedule.updated (new)"): a save changed the project's cabinets.
  'cabinet_schedule.updated': { kind: 'log_only' },
  // EZD-1201 (S18 Events emitted "share_link.viewed (new); share_link.expired (new); share_link.renewed (new)"):
  // written only as the event_log row by resolve_share_link and renew_share_link; never emitted.
  'share_link.viewed': { kind: 'log_only' },
  'share_link.expired': { kind: 'log_only' },
  'share_link.renewed': { kind: 'log_only' },
  // EZD-417 (S04b Events emitted "edge_profile.offered (new)"): written only as the event_log row by save_edge_offer,
  // with ids only (the rates are sell prices).
  'edge_profile.offered': { kind: 'log_only' },
} as const satisfies Record<string, EventEntry>;

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
  'field_task.completed': {
    projectId: string;
    taskId: string;
    room: string;
    photos: number;
    by: string;
    at: string;
  };
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
  'lock.request_cancelled': Record<string, unknown>;
  'lock.conflict': Record<string, unknown>;
  // EZD-120a Build step 5: the ids of the objects one save wrote.
  'model.saved': { objectIds: string[] };
  // EZD-313 (S02 Events emitted "import.completed (new): project id, source_file ids, counts accepted/deleted,
  // model_version_id").
  'import.completed': {
    projectId: string;
    sourceFileIds: string[];
    counts: { accepted: number; deleted: number };
    modelVersionId: string;
  };
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
  // EZD-1417 (S17b Events emitted "project, rooms, shapes, values, by, at"): the action id holds the sent rooms
  // whole (offline_change.ops, field_measure_session.rooms); each room here is named with its shape, wall count and
  // how many walls have a value, so the event log row stays under its 16 KB limit (vault/build/assumptions.md).
  'field.measure_sent': {
    projectId: string;
    changeId: string;
    rooms: Array<{
      id: string;
      name: string;
      shape: string | null;
      walls: number;
      measured: number;
    }>;
    by: string;
    at: string;
  };
  'offline_change.synced': {
    id: string;
    kind: 'measurement' | 'task_check' | 'photo_pin' | 'field_measure_send' | 'task_photo';
  };
  'field_pack.issued': Record<string, unknown>;
  'share_link.expiring': { projectId: string; expiresAt: string };
  'edge_profile.offered': { projectId: string; pieceId: string; choices: string[] };
  'cleanup.due': { versionIds: string[]; count: number };
  'code_check.completed': {
    runId: string;
    edition: string;
    warningCount: number;
    resultCount: number;
  };
  'code_warning.accepted': { runId: string; ruleId: string; objectId: string };
  // EZD-1009: the saved option, its group and label, and its status after the save.
  'design_option.created': DesignOptionEvent;
  'design_option.updated': DesignOptionEvent;
  'version.sent': Record<string, unknown>;
  'version.snapshot_named': Record<string, unknown>;
  'version.reverted': Record<string, unknown>;
  'cleanup.deleted': { versionIds: string[]; count: number; by: 'run' | 'sheet' };
  'room.closure_overridden': { roomId: string; gapIn: number; userId: string };
  'model.ai_change_accepted': { objectIds: string[]; count: number };
  // EZD-215 (07 Q-0708): fileId null when the note has no letter.
  'wall.engineer_required': { wallId: string; noteId: string; fileId: string | null };
  'wall.engineer_note_attached': { wallId: string; noteId: string; fileId: string | null };
  'catalog_item.created': Record<string, unknown>;
  'detail.placed': Record<string, unknown>;
  'user.joined': { membershipId: string; appUserId: string; via: 'sign_in' | 'invite_link' };
  'tenant.updated': { fields: TenantField[] };
  'tenant.defaults_updated': { keys: string[] };
  'tenant.code_edition_updated': { keys: ('code_edition' | 'optional_load_calc')[] };
  'tenant.title_block_updated': { keys: 'show_company'[] };
  'sheet.updated': { sheet: string; panelId: string };
  'catalog.settings_updated': { section: 'appliance_ratings'; applianceTypes: string[] };
  // EZD-1102: the tiers whose model or cost changed, and whether the allowance changed.
  'render.model_config_updated': {
    tiers: ('fast' | 'standard' | 'photoreal')[];
    allowance: boolean;
  };
  // EZD-712: `sourceId` is the profile copied (New profile copies the default; Duplicate the chosen one).
  'submittal_profile.created': { profileId: string; sourceId: string | null };
  // EZD-712: the changed columns, plus `is_default` (Set as default) and `archived_at` (Archive or restore).
  'submittal_profile.updated': { profileId: string; fields: string[] };
  // EZD-712: `movedProjects` is how many projects moved to the default.
  'submittal_profile.deleted': { profileId: string; movedProjects: number };
  'customer.created': { customerId: string };
  'customer.updated': { customerId: string; fields: CustomerEventField[] };
  // EZD-118 Build step 8: no `ezbinderJobId` (Q-0190); `source` only `standalone` (Q-0398).
  // EZD-301: `file` when the project starts from a file (S01 Events emitted).
  // EZD-1422: `field_measure` when the Foreman measures the rooms on the phone (S01 Input source).
  'project.created': { projectId: string; source: 'standalone' | 'file' | 'field_measure' };
  // EZD-130: field names (name, address, scope_of_work, type, customer_id) and per-project default keys.
  // EZD-613 adds code_edition; EZD-739 adds scope_trades (the scope tick boxes).
  'project.updated': { projectId: string; keys: string[] };
  // EZD-711: the confirmed field names and the lead flag; never the owner or other values.
  'property_record.imported': {
    projectId: string;
    recordId: string;
    fields: ('parcelNo' | 'owner' | 'legalDescription' | 'yearBuilt' | 'livingArea')[];
    leadFlag: boolean;
  };
  'project.renamed': { projectId: string; from: string; to: string };
  'project.status_changed': { projectId: string; from: string; to: string };
  'project.archived': { projectId: string };
  'project.restored': { projectId: string };
  'project.deleted': { projectId: string; name: string };
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
  'user.password_set': { membershipId: string; appUserId: string };
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
  // EZD-313 (S02 Events emitted import.cancelled): the import whose review was discarded.
  'import.cancelled': { projectId: string; jobId: string };
  // EZD-409: the cabinet runs and members (boxes, fillers, panels, corners, shelves, trim) the save wrote.
  'cabinet_schedule.updated': { objectIds: string[] };
  // EZD-1201: the event_log details; the row's object is the sent_package (the share link).
  'share_link.viewed': { projectId: string };
  'share_link.expired': { projectId: string; expiresAt: string };
  'share_link.renewed': { projectId: string; expiresAt: string };
}

// EZD-006 Step 7 (vault/plans/EZD-006.md; Q-0087 (ii)): the `public` RPCs that `anon` or `authenticated`
// may execute. T22 (c) calls each without the gate header and expects 42501; T22 (j) fails when the
// catalog holds a callable `public` function that is not listed. A ticket that adds such a function
// adds it here in its own commit (EZD-007: current_app_user_id, link_app_user; EZD-009: enqueue_job).
export type GatedRpcCall = { fn: string; args: Record<string, unknown> };

export const GATED_RPC_CALLS: GatedRpcCall[] = [
  // EZD-124: the project card menu (authenticated only).
  { fn: 'rename_project', args: { p_project: null, p_name: null } },
  { fn: 'set_project_status', args: { p_project: null, p_status: null } },
  { fn: 'archive_project', args: { p_project: null } },
  { fn: 'restore_project', args: { p_project: null } },
  { fn: 'delete_project', args: { p_project: null, p_confirm_name: null } },
  // EZD-137: Mark complete and Reopen (authenticated only).
  { fn: 'complete_project', args: { p_project: null } },
  { fn: 'reopen_project', args: { p_project: null } },
  // EZD-313: Finish import and Cancel import (authenticated only).
  { fn: 'finish_import', args: { p_project: null, p_job: null, p_objects: null } },
  { fn: 'cancel_import', args: { p_project: null, p_job: null } },
  // EZD-314: Retry of a failed import (authenticated only).
  { fn: 'retry_import', args: { p_project: null, p_job: null } },
  // EZD-309: the import review's batched save (authenticated only).
  {
    fn: 'save_import_review',
    args: { p_project: null, p_job: null, p_mode: null, p_changes: null },
  },
  // EZD-111 (vault/plans/EZD-111.md Shared lists): the send functions (authenticated) and the client-link
  // resolver (anon only).
  {
    fn: 'send_to_client',
    args: { p_project: null, p_token_hash: null, p_note: null, p_expiry_days: null },
  },
  { fn: 'mark_sent_package_emailed', args: { p_sent_package: null } },
  { fn: 'resolve_sent_package', args: { p_token_hash: null } },
  // EZD-1201: the share link functions (authenticated) and the share link status (anon only);
  // sweep_share_link_reminders is service_role only.
  { fn: 'resolve_share_link', args: { p_token_hash: null, p_view: null } },
  { fn: 'renew_share_link', args: { p_sent_package: null, p_expiry_days: null, p_ip: null } },
  { fn: 'revoke_share_link', args: { p_sent_package: null } },
  { fn: 'list_share_links', args: { p_project: null } },
  // EZD-417: the edge profile library (seeds a company's first read) and Edit offered edges (authenticated only).
  { fn: 'edge_profile_library', args: {} },
  { fn: 'save_edge_offer', args: { p_project: null, p_piece: null, p_choices: null, p_rates: null } },
  // EZD-711: the property appraiser import's save (authenticated only).
  {
    fn: 'set_property_record',
    args: {
      p_project: null,
      p_parcel_no: null,
      p_owner: null,
      p_legal_description: null,
      p_year_built: null,
      p_living_area: null,
      p_source_url: null,
    },
  },
  // EZD-611a: a code check run is stored (authenticated only).
  {
    fn: 'record_code_check_run',
    args: { p_project: null, p_model_version: null, p_edition: null, p_warnings: null },
  },
  // EZD-612: a warning accepted with a note, and acceptances carried to the next run (authenticated only).
  { fn: 'accept_code_warning', args: { p_run: null, p_rule: null, p_object: null, p_note: null } },
  { fn: 'carry_code_check_acceptances', args: { p_run: null } },
  // EZD-122: Name snapshot and Revert (authenticated only).
  { fn: 'name_snapshot', args: { p_project: null, p_version: null, p_name: null } },
  {
    fn: 'revert_to_version',
    args: { p_project: null, p_version: null, p_lock_epoch: null, p_objects: null, p_label: null },
  },
  // EZD-5601 step 2 (vault/plans/EZD-5601.md): the user's own Anthropic key functions, authenticated only.
  { fn: 'get_my_ai_key', args: {} },
  {
    fn: 'save_my_ai_key',
    args: {
      p_tenant_id: null,
      p_app_user_id: null,
      p_ciphertext: null,
      p_secret_version: null,
      p_last4: null,
    },
  },
  { fn: 'delete_my_ai_key', args: {} },
  { fn: 'take_ai_key_attempt', args: {} },
  {
    fn: 'rewrap_my_ai_key',
    args: { p_old_version: null, p_ciphertext: null, p_secret_version: null },
  },
  // EZD-5602 E2 (vault/plans/EZD-5602.md section 4): the assistant's slot and usage functions, authenticated only.
  { fn: 'take_ai_assistant_slot', args: {} },
  { fn: 'release_ai_assistant_slot', args: { p_slot_id: null } },
  { fn: 'record_ai_usage', args: { p_model: null, p_cost_usd: null } },
  // EZD-106 (vault/plans/EZD-106.md Part a): the Users page member writes, authenticated only.
  {
    fn: 'save_member',
    args: {
      p_membership_id: null,
      p_role_id: null,
      p_language: null,
      p_granted: null,
      p_ip: null,
    },
  },
  { fn: 'deactivate_member', args: { p_membership_id: null, p_ip: null } },
  { fn: 'reactivate_member', args: { p_membership_id: null, p_ip: null } },
  { fn: 'remove_member', args: { p_membership_id: null, p_ip: null } },
  // EZD-105b: the Owner-set password check and record, authenticated only.
  { fn: 'owner_password_target', args: { p_membership_id: null } },
  { fn: 'record_member_password_set', args: { p_membership_id: null, p_ip: null } },
  // EZD-129 (S15 Decision 13; Q-0202): a member's Project access read and save, the project choices for its
  // picker, and the wizard's Foreman candidates, authenticated only.
  { fn: 'member_scope', args: { p_membership_id: null } },
  {
    fn: 'save_member_scope',
    args: { p_membership_id: null, p_scope: null, p_project_ids: null, p_ip: null },
  },
  { fn: 'list_scope_projects', args: { p_search: '' } },
  { fn: 'list_foreman_candidates', args: {} },
  // EZD-107: the custom role reads and writes, authenticated only.
  { fn: 'list_roles', args: {} },
  { fn: 'create_role', args: { p_name: null, p_granted: null, p_ip: null } },
  { fn: 'update_role', args: { p_role_id: null, p_name: null, p_granted: null, p_ip: null } },
  { fn: 'delete_role', args: { p_role_id: null, p_ip: null } },
  // EZD-105 (S15 Invite user; Q-0695 rows 61-63): the invite writes and the link read, authenticated only.
  // accept_invite and invite_status are service_role only (the invitee has no session yet).
  {
    fn: 'create_invite',
    args: {
      p_email: null,
      p_name: null,
      p_role_id: null,
      p_language: null,
      p_scope: null,
      p_secret: null,
      p_token_sha256: null,
      p_ip: null,
    },
  },
  {
    fn: 'resend_invite',
    args: { p_membership_id: null, p_secret: null, p_token_sha256: null, p_ip: null },
  },
  { fn: 'cancel_invite', args: { p_membership_id: null, p_ip: null } },
  { fn: 'invite_link_secret', args: { p_membership_id: null } },
  // EZD-138 (Q-0216; Q-0695 row 61): the pending rows' link and code, authenticated only. invite_code_take is
  // service_role only (the invitee has no session yet).
  { fn: 'invite_links_for_viewer', args: { p_membership_ids: [] } },
  // EZD-109 (vault/plans/EZD-109.md section 3): the default event sink's event_log writer, authenticated only.
  // EZD-109 also gave the seven member and role writes above their trailing p_ip.
  {
    fn: 'log_event',
    args: {
      p_tenant_id: null,
      p_action: null,
      p_object_type: null,
      p_object_id: null,
      p_details: null,
      p_ip: null,
    },
  },
  // EZD-108 E4 (vault/plans/EZD-108.md): the own-profile functions, authenticated only.
  { fn: 'update_my_profile', args: { p_language: 'en', p_ipad_input_mode: 'finger' } },
  { fn: 'current_user_has_password', args: {} },
  { fn: 'health', args: {} },
  // EZD-007b (vault/plans/EZD-007b.md section 3): the linking and access functions, authenticated only.
  { fn: 'current_app_user_id', args: {} },
  { fn: 'link_app_user', args: {} },
  // EZD-009 Step 2 (vault/plans/EZD-009.md): enqueue_job, authenticated only.
  {
    fn: 'enqueue_job',
    args: { p_kind: 'test', p_project_id: null, p_payload: {}, p_max_attempts: 5 },
  },
  // EZD-024 Re-validation V3 (vault/plans/EZD-024.md): the error alert functions, executable by anon,
  // authenticated and service_role.
  {
    fn: 'record_error_alert',
    args: {
      p_kind: 'error',
      p_source: 'browser',
      p_fingerprint: '0'.repeat(64),
      p_title: 'Error: gate',
      p_ref: null,
      p_tenant_id: null,
      p_project_id: null,
    },
  },
  {
    fn: 'release_error_alert_email',
    args: {
      p_alert_id: '00000000-0000-4000-8000-000000000000',
      p_claim: '00000000-0000-4000-8000-000000000000',
    },
  },
  // EZD-033 Step 5 (vault/plans/EZD-033.md): the sign-in throttle functions, executable by anon and
  // authenticated.
  {
    fn: 'sign_in_throttle_take',
    args: { p_kind: 'link', p_email_key: null, p_ip_key: '0'.repeat(64) },
  },
  {
    fn: 'sign_in_throttle_settle',
    args: { p_attempt_id: '00000000-0000-4000-8000-000000000000', p_ip_attempt_id: null },
  },
  // EZD-143 D4, D11 (vault/plans/EZD-143.md): the error tunnel per-address count, anon only.
  { fn: 'error_tunnel_take', args: { p_ip_key: '0'.repeat(64), p_events: 1 } },
  // EZD-102 section 3 (vault/plans/EZD-102.md): the member's permission set, authenticated only.
  { fn: 'current_permissions', args: {} },
  // EZD-112 section 3 (vault/plans/EZD-112.md): the company identity write path, authenticated only.
  {
    fn: 'update_tenant_identity',
    args: { p_name: 'x', p_license_no: null, p_contact: {}, p_set_logo: false, p_logo_path: null },
  },
  // EZD-116: the Defaults write path, authenticated only.
  { fn: 'update_tenant_defaults', args: { p_set: {}, p_remove: [] } },
  // EZD-613: the Code edition write path, authenticated only.
  { fn: 'update_tenant_code_edition', args: { p_code_edition: null, p_optional_load_calc: null } },
  // EZD-709: the Title block write path, authenticated only.
  { fn: 'update_tenant_title_block', args: { p_show_company: true } },
  // EZD-1102: the Render models write path, authenticated only.
  { fn: 'save_render_settings', args: { p_tiers: [], p_allowance: null } },
  // EZD-712: the Sheet presets (submittal profile) write paths, authenticated only.
  { fn: 'create_submittal_profile', args: { p_department: 'Gate', p_source: null } },
  { fn: 'update_submittal_profile', args: { p_id: '00000000-0000-0000-0000-000000000000', p_changes: {} } },
  { fn: 'set_default_submittal_profile', args: { p_id: '00000000-0000-0000-0000-000000000000' } },
  { fn: 'archive_submittal_profile', args: { p_id: '00000000-0000-0000-0000-000000000000', p_archived: true } },
  { fn: 'delete_submittal_profile', args: { p_id: '00000000-0000-0000-0000-000000000000' } },
  {
    fn: 'set_project_submittal_profile',
    args: { p_project: '00000000-0000-0000-0000-000000000000', p_profile: '00000000-0000-0000-0000-000000000000' },
  },
  // EZD-113 section 3 (vault/plans/EZD-113.md): the customer list, authenticated only.
  { fn: 'list_customers', args: { p_search: '', p_archived: false, p_page: 1 } },
  // EZD-104 (vault/plans/EZD-104.md): the Users page functions, authenticated only.
  { fn: 'list_users', args: { p_search: '', p_page: 1 } },
  { fn: 'touch_last_active', args: {} },
  // EZD-110a section 3 (vault/plans/EZD-110a.md): the notification functions, authenticated only.
  { fn: 'list_notifications', args: { p_before_created_at: null, p_before_id: null } },
  { fn: 'open_notification', args: { p_id: '00000000-0000-4000-8000-000000000000' } },
  { fn: 'mark_all_notifications_read', args: {} },
  // EZD-140 section 3 (vault/plans/EZD-140.md): the notification settings save, authenticated only.
  { fn: 'save_my_notification_settings', args: { p_settings: [] } },
  // EZD-230 (Q-0122): the user's own rail tool order (authenticated only).
  { fn: 'update_my_rail_order', args: { p_order: [] } },
  // EZD-117a section 3 (vault/plans/EZD-117a.md; E3): the Projects list and count, authenticated only.
  // EZD-117b section 3 (vault/plans/EZD-117b.md; E3): both take p_search from M3.
  { fn: 'list_projects', args: { p_sort: 'edited', p_search: '' } },
  { fn: 'count_projects', args: { p_search: '' } },
  // EZD-128 (vault/plans/EZD-128.md Build step 14): the project switcher's recent list, authenticated only.
  { fn: 'record_project_open', args: { p_project: '00000000-0000-4000-8000-000000000000' } },
  { fn: 'list_recent_projects', args: { p_limit: 8 } },
  // EZD-118 section 3
  {
    fn: 'create_project',
    args: {
      p_name: 'x',
      p_address: 'x',
      p_type: 'kitchen',
      p_customer_id: null,
      p_scope_of_work: null,
    },
  },
  // EZD-221a section 3 (vault/plans/EZD-221a.md): the template create function, authenticated only.
  {
    fn: 'create_project_with_objects',
    args: {
      p_name: 'x',
      p_address: 'x',
      p_type: 'kitchen',
      p_customer_id: null,
      p_scope_of_work: null,
      p_objects: [],
    },
  },
  // EZD-120a section 3 (vault/plans/EZD-120a.md): the model save and checkpoint functions, authenticated only.
  {
    fn: 'save_objects',
    args: { p_project: '00000000-0000-4000-8000-000000000000', p_lock_epoch: 0, p_changes: [] },
  },
  { fn: 'create_checkpoint', args: { p_project: '00000000-0000-4000-8000-000000000000' } },
  // EZD-224 C5 (vault/plans/EZD-224.md): the checkpoint thumbnail functions, authenticated only.
  {
    fn: 'start_checkpoint_thumbnail',
    args: {
      p_project: '00000000-0000-4000-8000-000000000000',
      p_version: '00000000-0000-4000-8000-000000000000',
    },
  },
  {
    fn: 'set_checkpoint_thumbnail',
    args: {
      p_project: '00000000-0000-4000-8000-000000000000',
      p_version: '00000000-0000-4000-8000-000000000000',
    },
  },
  // EZD-125 (Q-0697): the edit lock functions, authenticated only (sweep_edit_locks is service_role only).
  {
    fn: 'acquire_edit_lock',
    args: { p_project: '00000000-0000-4000-8000-000000000000', p_device_id: null, p_ip: null },
  },
  {
    fn: 'release_edit_lock',
    args: {
      p_project: '00000000-0000-4000-8000-000000000000',
      p_reason: 'stop_editing',
      p_lock_epoch: null,
      p_ip: null,
    },
  },
  {
    fn: 'request_edit_lock',
    args: { p_project: '00000000-0000-4000-8000-000000000000', p_minutes: 5, p_ip: null },
  },
  {
    fn: 'cancel_edit_request',
    args: { p_project: '00000000-0000-4000-8000-000000000000', p_ip: null },
  },
  {
    fn: 'respond_edit_request',
    args: {
      p_project: '00000000-0000-4000-8000-000000000000',
      p_request: '00000000-0000-4000-8000-000000000000',
      p_response: 'keep',
      p_ip: null,
    },
  },
  { fn: 'read_edit_lock', args: { p_project: '00000000-0000-4000-8000-000000000000' } },
  // EZD-219 step 1 (vault/plans/EZD-219.md): the plan scale setter, authenticated only.
  {
    fn: 'set_plan_scale',
    args: { p_project: '00000000-0000-4000-8000-000000000000', p_scale: 0.5 },
  },
  // EZD-214: the phase view setter, authenticated only.
  {
    fn: 'set_phase_default',
    args: { p_project: '00000000-0000-4000-8000-000000000000', p_phase: 'existing' },
  },
  // EZD-299a section 4 T17 (vault/plans/EZD-299a.md): the sync conflict functions, authenticated only.
  {
    fn: 'record_sync_conflicts',
    args: { p_project: '00000000-0000-4000-8000-000000000000', p_changes: [], p_payload: {} },
  },
  { fn: 'list_my_sync_conflicts', args: {} },
  { fn: 'delete_my_sync_conflict', args: { p_id: '00000000-0000-4000-8000-000000000000' } },
  {
    fn: 'save_objects_resolving',
    args: {
      p_project: '00000000-0000-4000-8000-000000000000',
      p_lock_epoch: 0,
      p_changes: [],
      p_resolves: [],
    },
  },
  // EZD-236 section 3 (vault/plans/EZD-236.md; E1): the benchmark project function, authenticated only.
  { fn: 'create_benchmark_project', args: { p_changes: [] } },
  // EZD-135 section 3 (vault/plans/EZD-135.md): the System status backup function, authenticated only.
  { fn: 'system_backup_status', args: {} },
  // EZD-237 section 3 C1 (vault/plans/EZD-237.md): the benchmark run functions, authenticated only.
  { fn: 'record_benchmark_run', args: { p_device: {}, p_app_version: 'dev-0', p_results: {} } },
  { fn: 'list_benchmark_runs', args: { p_page: 1 } },
  // EZD-130: the Project settings write, authenticated only.
  {
    fn: 'update_project_settings',
    args: { p_project: '00000000-0000-4000-8000-000000000000', p_changes: {} },
  },
  // EZD-1415: the field measure save, authenticated only.
  { fn: 'save_field_measure_session', args: { p_project: null, p_rooms: null } },
  // EZD-1419: the office reopens sent field measure rooms, authenticated only.
  { fn: 'reopen_field_measure_session', args: { p_project: null } },
  // EZD-1422: the wizard's field measure request, its Resend and Cancel, authenticated only.
  { fn: 'request_field_measure', args: { p_project: null, p_membership: null } },
  { fn: 'resend_field_measure_request', args: { p_project: null } },
  { fn: 'cancel_field_measure_request', args: { p_project: null } },
  // EZD-1402: the field action photo start and record, authenticated only.
  { fn: 'start_field_photo', args: { p_project: null, p_action: null, p_kind: null, p_ext: null } },
  {
    fn: 'sync_field_action',
    args: {
      p_id: null,
      p_project: null,
      p_device: null,
      p_kind: null,
      p_ops: null,
      p_base_version: null,
      p_queued_at: null,
      p_photo: null,
    },
  },
  // EZD-1418: the import of a recorded field measure send, authenticated only.
  { fn: 'create_field_measure_import', args: { p_project: null, p_change: null, p_items: null } },
  // EZD-1409: the phone's Edit text of a field task, authenticated only.
  { fn: 'edit_field_task', args: { p_project: null, p_task: null, p_text: null } },
];

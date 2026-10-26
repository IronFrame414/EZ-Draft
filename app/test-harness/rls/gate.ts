// EZD-006 Step 7 (vault/plans/EZD-006.md; Q-0087 (ii)): the `public` RPCs that `anon` or `authenticated`
// may execute. T22 (c) calls each without the gate header and expects 42501; T22 (j) fails when the
// catalog holds a callable `public` function that is not listed. A ticket that adds such a function
// adds it here in its own commit (EZD-007: current_app_user_id, link_app_user; EZD-009: enqueue_job).
export type GatedRpcCall = { fn: string; args: Record<string, unknown> };

export const GATED_RPC_CALLS: GatedRpcCall[] = [
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
];

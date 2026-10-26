// EZD-168 Step 1 (vault/plans/EZD-168.md): the `private` functions each API role may execute. The audit
// (`auditRls`, audit.ts) fails on any other `private` function an API role can run, on any PUBLIC
// execute, and on an entry here that the role can no longer execute.
// A ticket that grants execute on a `private` function to an API role adds its entry here with a reason
// in the same commit and the docs line; the security-reviewer approves it.
export type ApiRole = 'anon' | 'authenticated' | 'service_role';
export type PrivateExecuteEntry = { fn: string; reason: string };

export const API_ROLES: readonly ApiRole[] = ['anon', 'authenticated', 'service_role'];

const GATE =
  'PostgREST runs it as the request role before every request (pgrst.db_pre_request; EZD-006; Q-0087 (ii)).';
const POLICY_HELPER = 'RLS helper called by table policies as the querying user (EZD-006 Step 3).';
const ONE_OFF =
  'RLS helper granted to authenticated by EZD-006 for one-off checks (docs/architecture.md Row-level security, Helpers).';
const REALTIME_POLICY = 'Called by the realtime.messages policies as the joining user (EZD-018).';

export const PRIVATE_EXECUTE: Record<ApiRole, readonly PrivateExecuteEntry[]> = {
  anon: [{ fn: 'private.api_request_gate()', reason: GATE }],
  authenticated: [
    { fn: 'private.all_projects()', reason: POLICY_HELPER },
    { fn: 'private.api_request_gate()', reason: GATE },
    { fn: 'private.app_user_id()', reason: POLICY_HELPER },
    { fn: 'private.can_see_project(uuid)', reason: ONE_OFF },
    { fn: 'private.listed_project_ids()', reason: POLICY_HELPER },
    { fn: 'private.realtime_can_receive(text)', reason: REALTIME_POLICY },
    { fn: 'private.realtime_can_track(text)', reason: REALTIME_POLICY },
    {
      fn: 'private.realtime_topic_id(text, text)',
      reason:
        'Granted to authenticated with the realtime_can_* helpers (EZD-018, 20261022120000_create_realtime_topic_helpers.sql).',
    },
    { fn: 'private.session_is_live()', reason: ONE_OFF },
    { fn: 'private.tenant_id()', reason: POLICY_HELPER },
    { fn: 'private.tenant_user_ids()', reason: POLICY_HELPER },
  ],
  service_role: [{ fn: 'private.api_request_gate()', reason: GATE }],
};

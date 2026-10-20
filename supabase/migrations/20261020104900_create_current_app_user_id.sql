-- EZD-007b Step 2 (vault/plans/EZD-007b.md; parent vault/plans/EZD-007.md Step 2.3): the caller's
-- app_user id, read by server routes (EZD-007c getSession, EZD-018). Null when the token's session has
-- ended (private.session_is_live: the session_id claim is no longer in auth.sessions), so a deactivated
-- user's still-valid JWT gets null and routes fail closed at 401 (Q-0052 (c)); it never raises, unlike
-- the private helpers that raise 42501 on an ended session. One auth.sessions primary-key lookup and
-- one app_user unique-index lookup per call (11 rule 10). Executable by authenticated only; default
-- privileges for role postgres in public would otherwise let anon and service_role execute it
-- (finding B3). Listed in GATED_RPC_CALLS (app/test-harness/rls/gate.ts).
create function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.session_is_live()
      then (select a.id from public.app_user a where a.auth_user_id = auth.uid())
    else null::uuid
  end
$$;

revoke all on function public.current_app_user_id() from public, anon, service_role;
grant execute on function public.current_app_user_id() to authenticated;

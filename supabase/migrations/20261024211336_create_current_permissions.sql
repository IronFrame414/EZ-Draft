-- EZD-102 Step 1 (vault/plans/EZD-102.md): the caller's membership, scope, granted switches and listed
-- projects in one call, read by server routes through loadPermissionContext (one indexed query per
-- request; 11 rule 10). The membership comes from the token claim set by the token hook (EZD-006); no row
-- when the claim is missing (no active membership, or two of them) or the membership is no longer active.
-- Security invoker, so RLS stays the backstop and an ended session raises 42501 in the policy helpers
-- (Q-0052 (c)). Both inner reads walk a primary key: user_permission (membership_id, permission_key) and
-- membership_project (membership_id, project_id). Executable by authenticated only (ARCH Function grants);
-- listed in GATED_RPC_CALLS (app/test-harness/rls/gate.ts).
create function public.current_permissions()
returns table (
  membership_id uuid,
  project_scope text,
  permission_keys text[],
  listed_project_ids uuid[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    m.id,
    m.scope,
    array(
      select up.permission_key
      from public.user_permission up
      where up.membership_id = m.id and up.granted
      order by up.permission_key
    ),
    array(
      select mp.project_id
      from public.membership_project mp
      where mp.membership_id = m.id
      order by mp.project_id
    )
  from public.membership m
  where m.id = nullif(auth.jwt() ->> 'membership_id', '')::uuid
    and m.status = 'active'
$$;

revoke all on function public.current_permissions() from public, anon, service_role;
grant execute on function public.current_permissions() to authenticated;

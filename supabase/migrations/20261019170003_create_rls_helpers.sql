-- EZD-006 Step 3 (vault/plans/EZD-006.md): policy helpers. All stable, security definer, empty
-- search_path, executable by authenticated only. They read the request's claims with auth.jwt().
-- Policies call them wrapped in a scalar subquery, (select private.tenant_id()), so PostgreSQL runs
-- each once per statement (11 rule 10: the tenant comes from the session claim, never from a
-- membership join per row). tenant_id() and app_user_id() raise 42501 when the token's session no
-- longer exists in auth.sessions, so a deactivated user's next request is refused (ticket Done when).

create function private.session_is_live()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.sessions
    where id = (auth.jwt() ->> 'session_id')::uuid
  )
$$;

create function private.tenant_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.session_is_live() then
    raise exception 'session_ended' using errcode = '42501';
  end if;
  return (auth.jwt() ->> 'tenant_id')::uuid;
end
$$;

create function private.app_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.session_is_live() then
    raise exception 'session_ended' using errcode = '42501';
  end if;
  return (auth.jwt() ->> 'app_user_id')::uuid;
end
$$;

create function private.all_projects()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'project_scope' = 'all', false)
$$;

create function private.listed_project_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(project_id), '{}')
  from public.membership_project
  where membership_id = (auth.jwt() ->> 'membership_id')::uuid
    and tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
$$;

create function private.tenant_user_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(user_id), '{}')
  from public.membership
  where tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
$$;

-- One-off checks such as EZD-018's channel join; table policies use the array form.
create function private.can_see_project(p uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.project
      where id = p and tenant_id = private.tenant_id()
    )
    and (private.all_projects() or p = any (private.listed_project_ids()))
$$;

revoke all on function private.session_is_live() from public, anon;
revoke all on function private.tenant_id() from public, anon;
revoke all on function private.app_user_id() from public, anon;
revoke all on function private.all_projects() from public, anon;
revoke all on function private.listed_project_ids() from public, anon;
revoke all on function private.tenant_user_ids() from public, anon;
revoke all on function private.can_see_project(uuid) from public, anon;

grant execute on function private.session_is_live() to authenticated;
grant execute on function private.tenant_id() to authenticated;
grant execute on function private.app_user_id() to authenticated;
grant execute on function private.all_projects() to authenticated;
grant execute on function private.listed_project_ids() to authenticated;
grant execute on function private.tenant_user_ids() to authenticated;
grant execute on function private.can_see_project(uuid) to authenticated;

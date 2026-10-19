-- EZD-006 Step 4 (vault/plans/EZD-006.md; ticket Scope; 11 Operations; Q-0044 (b)): deactivating a
-- user or narrowing their project scope ends their sessions. Sessions are not per tenant, so the
-- person's sessions end everywhere; they sign in again and the hook issues fresh claims.
-- EZD-018 redefines end_user_sessions with create or replace (same signature and grants) to also push
-- session.ended (Q-0052 (c)). EZD-129 writes membership.scope and membership_project and relies on
-- these triggers; removals are deletes (or updates of membership_id / project_id), never trigger bypasses.
create function private.end_user_sessions(p_app_user_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from auth.sessions
  where user_id = (select auth_user_id from public.app_user where id = p_app_user_id)
$$;

revoke all on function private.end_user_sessions(uuid) from public;

-- Status change, scope change, or removal (Remove user, S15 row menu; EZD-106).
create function private.membership_end_sessions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    or new.status is distinct from old.status
    or new.scope is distinct from old.scope
  then
    perform private.end_user_sessions(old.user_id);
  end if;
  return null;
end
$$;

revoke all on function private.membership_end_sessions() from public;

create trigger membership_end_sessions
  after update or delete on public.membership
  for each row execute function private.membership_end_sessions();

-- A removed listed project narrows the scope; an inserted one does not end sessions, because listed
-- projects are read live on every statement (Q-0044 (b)). An update of membership_id or project_id
-- removes the old listed project from the old membership (a guard; no ticket plans such updates).
create function private.membership_project_end_sessions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    or new.membership_id is distinct from old.membership_id
    or new.project_id is distinct from old.project_id
  then
    perform private.end_user_sessions(
      (select user_id from public.membership where id = old.membership_id)
    );
  end if;
  return null;
end
$$;

revoke all on function private.membership_project_end_sessions() from public;

create trigger membership_project_end_sessions
  after update or delete on public.membership_project
  for each row execute function private.membership_project_end_sessions();

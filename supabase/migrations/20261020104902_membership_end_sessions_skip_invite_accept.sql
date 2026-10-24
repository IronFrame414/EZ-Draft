-- EZD-007b Step 3 (vault/plans/EZD-007b.md; parent vault/plans/EZD-007.md Step 2.4; Q-0044 (b)): only
-- narrowing changes end sessions. link_app_user() turns an invited membership active during sign-in,
-- and that acceptance must not end the session being created. Same body as
-- 20261019170005_create_end_sessions_triggers.sql, with the status clause excluding invited -> active.
-- Every other status change, every scope change and every delete still ends the person's sessions.
-- The trigger membership_end_sessions and the existing execute privileges are kept as they are.
create or replace function private.membership_end_sessions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    or (new.status is distinct from old.status and not (old.status = 'invited' and new.status = 'active'))
    or new.scope is distinct from old.scope
  then
    perform private.end_user_sessions(old.user_id);
  end if;
  return null;
end
$$;

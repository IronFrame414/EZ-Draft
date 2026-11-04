-- EZD-165 (vault/plans/EZD-165.md; Q-0268 sweep item 46): also end sessions when a membership's user_id or tenant_id changes, for the old and the new person. Same trigger, same privileges.
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
    or new.user_id is distinct from old.user_id
    or new.tenant_id is distinct from old.tenant_id
  then
    perform private.end_user_sessions(old.user_id);
  end if;
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    perform private.end_user_sessions(new.user_id);
  end if;
  return null;
end
$$;

revoke all on function private.membership_end_sessions() from public;

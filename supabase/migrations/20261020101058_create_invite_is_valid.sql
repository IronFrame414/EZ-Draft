-- EZD-007a Step 2.0 (vault/plans/EZD-007a.md): the one source of "valid pending invite" (Q-0050 (a):
-- unexpired, not cancelled). An invite is valid for 7 days from membership.invited_at (EZD-105 row);
-- a null sent date cannot be shown unexpired, so it is invalid (fail closed). Called by the
-- before-user-created hook (EZD-007a) and link_app_user (EZD-007b); EZD-105 may redefine it.
-- In schema private, so it is not on the REST API. Execute is revoked from public (as every private
-- function; the schema's default privileges did not cover it on the pinned stack) and no role is given
-- execute: the hook and link_app_user run as owner.
create function private.invite_is_valid(p_status text, p_invited_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_status = 'invited'
    and p_invited_at is not null
    and p_invited_at > now() - interval '7 days';
$$;

revoke all on function private.invite_is_valid(text, timestamptz) from public;

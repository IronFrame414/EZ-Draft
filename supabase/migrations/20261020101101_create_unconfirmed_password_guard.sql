-- EZD-007a Step 2.5 (vault/plans/EZD-007a.md; Q-0094): a password survives only on a confirmed account.
-- Supabase Auth creates the auth user at sign-up before the email is confirmed, so a password typed by
-- anyone who knows an invited address would otherwise be stored until the mailbox owner confirms. This
-- trigger clears encrypted_password on every insert or update of auth.users while email_confirmed_at is
-- null (the pinned Auth stores null for a user without a password and reads it as "no password").
-- Confirmed users are untouched: EZD-033 and EZD-105b set passwords on confirmed accounts (Q-0095).
-- No role may execute the function directly; it runs only as the trigger.
create function private.auth_users_password_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is null then
    new.encrypted_password := null;
  end if;
  return new;
end
$$;

revoke all on function private.auth_users_password_guard() from public;

create trigger auth_users_password_guard
  before insert or update on auth.users
  for each row execute function private.auth_users_password_guard();

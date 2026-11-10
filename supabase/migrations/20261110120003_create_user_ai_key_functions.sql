-- EZD-5601 M3 (vault/plans/EZD-5601.md section 1 Data; Q-0637 key storage; AC-EZD-5601-4, -5, -7, -10): the only
-- ways to the user_ai_key and ai_key_attempt tables. Each public function takes the user and the tenant from
-- the claims (private.app_user_id(), private.tenant_id()), so a caller reaches only their own row; the Owner
-- and colleagues get nothing. Executable by authenticated only behind the API request gate (L-016); all five
-- are listed in GATED_RPC_CALLS (app/test-harness/rls/gate.ts). The membership trigger deletes the key row when
-- the membership ends (Q-0637 "Row deleted when the membership ends").

-- The caller's own key row, always exactly one row: the key columns are null when there is no key or no
-- tenant claim.
create function public.get_my_ai_key()
returns table (
  tenant_id uuid,
  app_user_id uuid,
  last4 text,
  secret_version integer,
  ciphertext text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_tenant uuid;
begin
  perform private.require_api_gate();
  v_user := private.app_user_id();
  v_tenant := private.tenant_id();
  if v_user is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  return query
  select v_tenant, v_user, k.last4, k.secret_version, k.ciphertext
  from (select 1) one
  left join public.user_ai_key k on k.tenant_id = v_tenant and k.app_user_id = v_user;
end
$$;

revoke all on function public.get_my_ai_key() from public, anon, service_role;
grant execute on function public.get_my_ai_key() to authenticated;

-- Saves (or replaces) the caller's own key. The ids must be the caller's own, read from get_my_ai_key, because
-- the ciphertext is bound to them (AAD); the caller must hold an active membership in that tenant.
create function public.save_my_ai_key(
  p_tenant_id uuid,
  p_app_user_id uuid,
  p_ciphertext text,
  p_secret_version integer,
  p_last4 text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_tenant uuid;
begin
  perform private.require_api_gate();
  v_user := private.app_user_id();
  v_tenant := private.tenant_id();
  if v_user is null or v_tenant is null
    or p_tenant_id is distinct from v_tenant
    or p_app_user_id is distinct from v_user
    or not exists (
      select 1 from public.membership m
      where m.tenant_id = v_tenant and m.user_id = v_user and m.status = 'active'
    )
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_ciphertext is null
    or char_length(p_ciphertext) not between 40 and 512
    or p_ciphertext !~ '^[A-Za-z0-9+/]+={0,2}$'
    or p_secret_version is null
    or p_secret_version not between 1 and 999999
    or p_last4 is null
    or p_last4 !~ '^[!-~]{4}$'
  then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  insert into public.user_ai_key as k (tenant_id, app_user_id, ciphertext, secret_version, last4)
  values (v_tenant, v_user, p_ciphertext, p_secret_version, p_last4)
  on conflict (tenant_id, app_user_id) do update
    set ciphertext = excluded.ciphertext,
        secret_version = excluded.secret_version,
        last4 = excluded.last4;
end
$$;

revoke all on function public.save_my_ai_key(uuid, uuid, text, integer, text) from public, anon, service_role;
grant execute on function public.save_my_ai_key(uuid, uuid, text, integer, text) to authenticated;

-- Deletes the caller's own key; deleted is false (and last4 null) when there was none.
create function public.delete_my_ai_key()
returns table (deleted boolean, last4 text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_tenant uuid;
  v_last4 text;
begin
  perform private.require_api_gate();
  v_user := private.app_user_id();
  v_tenant := private.tenant_id();
  if v_user is null or v_tenant is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  delete from public.user_ai_key k
  where k.tenant_id = v_tenant and k.app_user_id = v_user
  returning k.last4 into v_last4;

  return query select v_last4 is not null, v_last4;
end
$$;

revoke all on function public.delete_my_ai_key() from public, anon, service_role;
grant execute on function public.delete_my_ai_key() to authenticated;

-- One key check slot: 5 per user in a rolling 15 minutes (AC-EZD-5601-7). The caller's app_user row is locked
-- before the count, so two checks at once cannot both take the fifth slot (EZD-321).
create function public.take_ai_key_attempt()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_tenant uuid;
  v_count integer;
begin
  perform private.require_api_gate();
  v_user := private.app_user_id();
  v_tenant := private.tenant_id();
  if v_user is null or v_tenant is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  perform 1 from public.app_user u where u.id = v_user for update;

  delete from public.ai_key_attempt a where a.at < now() - interval '15 minutes';

  select count(*) into v_count
  from public.ai_key_attempt a
  where a.tenant_id = v_tenant and a.app_user_id = v_user
    and a.at > now() - interval '15 minutes';

  if v_count >= 5 then
    return false;
  end if;

  insert into public.ai_key_attempt (tenant_id, app_user_id) values (v_tenant, v_user);
  return true;
end
$$;

revoke all on function public.take_ai_key_attempt() from public, anon, service_role;
grant execute on function public.take_ai_key_attempt() to authenticated;

-- Re-encrypts the caller's own key under a newer encryption key (rewrap on use, Q-0637). Writes only when the
-- row still has p_old_version, so a concurrent rewrap or save wins; returns whether a row changed.
create function public.rewrap_my_ai_key(
  p_old_version integer,
  p_ciphertext text,
  p_secret_version integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_tenant uuid;
begin
  perform private.require_api_gate();
  v_user := private.app_user_id();
  v_tenant := private.tenant_id();
  if v_user is null or v_tenant is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_ciphertext is null
    or char_length(p_ciphertext) not between 40 and 512
    or p_ciphertext !~ '^[A-Za-z0-9+/]+={0,2}$'
    or p_secret_version is null
    or p_secret_version not between 1 and 999999
    or p_old_version is null
    or p_secret_version <= p_old_version
  then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  update public.user_ai_key k
  set ciphertext = p_ciphertext,
      secret_version = p_secret_version
  where k.tenant_id = v_tenant and k.app_user_id = v_user and k.secret_version = p_old_version;

  return found;
end
$$;

revoke all on function public.rewrap_my_ai_key(integer, text, integer) from public, anon, service_role;
grant execute on function public.rewrap_my_ai_key(integer, text, integer) to authenticated;

-- The key row ends with its membership: deleted, no longer active, or moved to another person or company.
create function private.membership_drop_ai_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.user_ai_key k
    where k.tenant_id = old.tenant_id and k.app_user_id = old.user_id;
    return old;
  end if;

  if new.status <> 'active'
    or new.user_id is distinct from old.user_id
    or new.tenant_id is distinct from old.tenant_id
  then
    delete from public.user_ai_key k
    where k.tenant_id = old.tenant_id and k.app_user_id = old.user_id;
  end if;
  return new;
end
$$;

revoke all on function private.membership_drop_ai_key() from public;

create trigger membership_drop_ai_key
  after update or delete on public.membership
  for each row execute function private.membership_drop_ai_key();

-- EZD-111 M2 (vault/plans/EZD-111.md Database functions; Q-0700; 03b rules 1, 8, 11; R24 #16b): the three ways
-- into sent_package.
--
-- send_to_client: Send to client and project scope checked here as well as in the route (Q-0700 10 row). The
-- recipient is the project's client, read here at send time, never from the caller (Q-0700 05 row). A project
-- without a client is refused before anything is written. Every send makes a new checkpoint through
-- private.make_checkpoint (under the edit_lock row lock) and never writes edit_lock, so the holder and
-- lock_epoch stay as they were (Q-0700 03 row Freezing). When someone else holds the lock, the answer names them
-- and the newest saved object's time (03b rule 8). project.status is never read or written (Q-0199).
--
-- mark_sent_package_emailed: the sender's own row, once, after the email went.
--
-- resolve_sent_package: the client link's lookup by token hash, for the signed-out client page (EZD-1202);
-- nothing for an unknown, expired or revoked link. Granted to anon only.

create function public.send_to_client(p_project uuid, p_token_hash text, p_note text, p_expiry_days integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_membership uuid;
  v_project public.project;
  v_customer public.customer;
  v_tenant_row public.tenant;
  v_version uuid;
  v_holder_id uuid;
  v_holder jsonb := null;
  v_holder_name text;
  v_saved_at timestamptz;
  v_now timestamptz;
  v_id uuid;
  v_expires timestamptz;
  v_sender_email text;
begin
  perform private.require_api_gate();

  v_tenant := private.tenant_id();
  v_user := private.app_user_id();
  v_membership := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  if v_tenant is null or v_user is null or v_membership is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.user_permission up
    where up.membership_id = v_membership
      and up.tenant_id = v_tenant
      and up.permission_key = 'send_to_client'
      and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_project is null or not private.can_see_project(p_project) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_expiry_days is null or p_expiry_days not between 1 and 365
    or (p_note is not null and char_length(p_note) not between 1 and 1000) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select * into v_project from public.project p where p.id = p_project and p.tenant_id = v_tenant;
  select * into v_customer from public.customer c
  where c.id = v_project.customer_id and c.tenant_id = v_tenant;
  if not found or v_project.customer_id is null then
    raise exception 'no_client' using errcode = 'P0001';
  end if;

  v_version := private.make_checkpoint(p_project, v_user);

  -- make_checkpoint holds the edit_lock row lock; the holder is read under it.
  select l.holder_app_user_id into v_holder_id from public.edit_lock l where l.project_id = p_project;
  if v_holder_id is not null and v_holder_id <> v_user then
    select coalesce(nullif(btrim(u.name), ''), u.email) into v_holder_name
    from public.app_user u where u.id = v_holder_id;
    select max(o.updated_at) into v_saved_at from public.model_object o where o.project_id = p_project;
    v_holder := jsonb_build_object('name', v_holder_name, 'saved_at', v_saved_at);
  end if;

  v_now := clock_timestamp();
  v_expires := v_now + make_interval(days => p_expiry_days);
  insert into public.sent_package
    (tenant_id, project_id, model_version_id, kind, recipients, note, token_hash, expires_at, created_by,
     created_at)
  values (v_tenant, p_project, v_version, 'client',
    jsonb_build_array(jsonb_build_object('name', v_customer.name, 'email', v_customer.email)),
    p_note, p_token_hash, v_expires, v_user, v_now)
  returning id into v_id;

  select * into v_tenant_row from public.tenant t where t.id = v_tenant;
  select u.email into v_sender_email from public.app_user u where u.id = v_user;

  return jsonb_build_object(
    'sent_package_id', v_id,
    'model_version_id', v_version,
    'expires_at', v_expires,
    'project_name', v_project.name,
    'recipient', jsonb_build_object('name', v_customer.name, 'email', v_customer.email),
    'company', jsonb_build_object(
      'name', v_tenant_row.name,
      'reply_to', nullif(btrim(v_tenant_row.contact ->> 'email'), '')),
    'sender_email', v_sender_email,
    'holder', v_holder);
end
$$;

revoke all on function public.send_to_client(uuid, text, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.send_to_client(uuid, text, text, integer) to authenticated;

create function public.mark_sent_package_emailed(p_sent_package uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_membership uuid;
begin
  perform private.require_api_gate();

  v_tenant := private.tenant_id();
  v_user := private.app_user_id();
  v_membership := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  if v_tenant is null or v_user is null or v_membership is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.user_permission up
    where up.membership_id = v_membership
      and up.tenant_id = v_tenant
      and up.permission_key = 'send_to_client'
      and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  update public.sent_package s
  set email_sent_at = clock_timestamp()
  where s.id = p_sent_package and s.tenant_id = v_tenant and s.created_by = v_user
    and s.email_sent_at is null;
  return found;
end
$$;

revoke all on function public.mark_sent_package_emailed(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_sent_package_emailed(uuid) to authenticated;

create function public.resolve_sent_package(p_token_hash text)
returns table (
  sent_package_id uuid,
  tenant_id uuid,
  project_id uuid,
  model_version_id uuid,
  kind text,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_api_gate();

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  return query
  select s.id, s.tenant_id, s.project_id, s.model_version_id, s.kind, s.expires_at
  from public.sent_package s
  where s.token_hash = p_token_hash and s.revoked_at is null and s.expires_at > now();
end
$$;

revoke all on function public.resolve_sent_package(text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_sent_package(text) to anon;

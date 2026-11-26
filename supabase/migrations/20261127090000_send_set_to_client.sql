-- EZD-719 (S13 Controls "Send to client | Header Share | Sends the set to the client; numbered Version N before
-- Rev 0, Rev N after"; S13 rule 12; R24 #26; 09h Revision rules; 03c permit_revision sent_to; AC-EZD-719-1;
-- vault/build/assumptions/EZD-719.md Settled rows "What sends the set sends" and "Numbering").
--
-- 1. sent_package gains the set the send went out with: sheet_set_kind ('permit' or 'client') and sheet_set_id (the
--    model's sheet_set object id, null while the set is the unchanged default). Both null for a send made outside
--    the Sheets screen (EZD-111's Share). The client page's Plans tab (EZD-1202) reads them.
-- 2. send_to_client (20261117200000's, same checks, version numbering, event and broadcast) takes the set and, once
--    Rev 0 is issued, numbers the send as the next Rev: a permit_revision row (sent_to 'client', the send's
--    checkpoint, delta_object_ids empty until EZD-718) under the same edit_lock row lock issue_permit_set takes, so
--    a client Rev and a department issue never share a number. Before Rev 0 it writes no permit_revision row and the
--    send is "Version <version_no>". It needs Send to client only: no code check, no PDF, no Issue switch. Every
--    sent row still takes a version_no (model_version_sent_check). The answer, the event_log version.sent row and
--    the broadcast carry rev_no (null before Rev 0).

-- 1. sent_package: the set
alter table public.sent_package
  add column sheet_set_kind text check (sheet_set_kind is null or sheet_set_kind in ('permit', 'client')),
  add column sheet_set_id uuid,
  add constraint sent_package_sheet_set_check check (sheet_set_id is null or sheet_set_kind is not null);

-- 2. send_to_client with the set and the Rev numbering
drop function public.send_to_client(uuid, text, text, integer, inet);

create function public.send_to_client(
  p_project uuid, p_token_hash text, p_note text, p_expiry_days integer, p_ip inet default null,
  p_sheet_set_kind text default null, p_sheet_set_id uuid default null)
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
  v_no integer;
  v_rev integer;
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
    or (p_note is not null and char_length(p_note) not between 1 and 1000)
    or (p_sheet_set_kind is not null and p_sheet_set_kind not in ('permit', 'client'))
    or (p_sheet_set_id is not null and p_sheet_set_kind is null) then
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

  -- Numbering (09p): still under the edit_lock row lock, so a second send waits here and then sees this one's
  -- number; the unique index is the backstop.
  select coalesce(max(v.version_no), 0) + 1 into v_no
  from public.model_version v where v.project_id = p_project and v.is_sent;
  update public.model_version v
  set is_sent = true, version_no = v_no, sent_to = v_customer.name, sent_at = v_now
  where v.id = v_version;

  -- EZD-719: after Rev 0 the send is the next Rev, still under the edit_lock row lock (issue_permit_set numbers
  -- under the same lock; permit_revision_rev_key is the backstop). Before Rev 0 there is no Rev.
  select max(r.rev_no) + 1 into v_rev from public.permit_revision r where r.project_id = p_project;
  if v_rev is not null then
    insert into public.permit_revision
      (tenant_id, project_id, rev_no, model_version_id, issued_at, issued_by, sent_to)
    values (v_tenant, p_project, v_rev, v_version, v_now, v_user, 'client');
  end if;

  v_expires := v_now + make_interval(days => p_expiry_days);
  insert into public.sent_package
    (tenant_id, project_id, model_version_id, kind, recipients, note, token_hash, expires_at, created_by,
     created_at, sheet_set_kind, sheet_set_id)
  values (v_tenant, p_project, v_version, 'client',
    jsonb_build_array(jsonb_build_object('name', v_customer.name, 'email', v_customer.email)),
    p_note, p_token_hash, v_expires, v_user, v_now, p_sheet_set_kind, p_sheet_set_id)
  returning id into v_id;

  perform private.write_event_log('version.sent', 'project', p_project,
    jsonb_build_object('model_version_id', v_version, 'version_no', v_no, 'rev_no', v_rev,
      'sent_package_id', v_id), p_ip);
  perform private.broadcast_project(p_project, 'version.sent', jsonb_build_object(
    'modelVersionId', v_version,
    'versionNo', v_no,
    'revNo', v_rev,
    'sentAt', v_now));

  select * into v_tenant_row from public.tenant t where t.id = v_tenant;
  select u.email into v_sender_email from public.app_user u where u.id = v_user;

  return jsonb_build_object(
    'sent_package_id', v_id,
    'model_version_id', v_version,
    'version_no', v_no,
    'rev_no', v_rev,
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

revoke all on function public.send_to_client(uuid, text, text, integer, inet, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.send_to_client(uuid, text, text, integer, inet, text, uuid) to authenticated;

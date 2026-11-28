-- EZD-2032 (AC-EZD-2032-1 to -4; S18 Page tab: Plans; Q-0911; Q-0059; vault/build/assumptions/EZD-1205.md Settled rows,
-- now EZD-2032's; vault/build/assumptions/EZD-2032.md): the client page's Plans tab, fed by Send set to client (EZD-719).
--
-- 1. job.kind gains client_sheet_images (the newest job_kind_check is 20261121194713_create_reference_drawing.sql).
--    The send of a sheet set queues one such job, payload { sentPackageId }; it writes one 2400 px WebP and one 400 px
--    thumbnail per sheet of the sent set, at the frozen sent version, to the exports bucket under
--    <tenant>/<project>/client-sheets/<sent_package id>/, and its result lists the sheets in set order.
-- 2. private.client_sheet_images_queued: the send has such a job. A send with no sheet set, or one made before this
--    migration, has none, so its client page has no Plans tab (AC-EZD-2032-2).
-- 3. client_page: shares_sheets is now "the send has a sheet set and its images job" (was "has a sheet set").
-- 4. public.client_sheets(token hash), anon only, the same filters as client_page: null for a link that is not live;
--    otherwise the Plans tab's state, 'preparing' until the newest such job is done, then 'ready' with the job's
--    result (the folder and, per sheet, number, title and pixel sizes). No cost data exists on these rows.
-- 5. Storage: the signed-out server may sign (read) an exports object only under
--    <tenant>/<project>/client-sheets/<id>/<file> where <id> is a live client sent_package of that tenant and project
--    with a sheet set (not revoked, not expired, company not locked), and only with the API gate header (which only
--    the server adds). An expired or revoked link's images can no longer be signed (AC-EZD-2032-3). Writes stay with
--    the job's secret key; anon gets no insert, update or delete policy.
--    The policy's check is public.client_sheet_object_readable(name), anon only: it is in public because anon may
--    execute nothing in private but the request gate (rls.hook T10). It answers true or false about one path and only
--    to a request with the gate header.

alter table public.job
  drop constraint job_kind_check,
  add constraint job_kind_check check (
    kind in ('import', 'export', 'render', 'ai_read', 'thumbnail', 'diff', 'cleanup', 'test', 'notification_email',
      'project_purge', 'field_task_draft', 'reference_convert', 'client_sheet_images')
  );

create function private.client_sheet_images_queued(p_row public.sent_package)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.job j
    where j.tenant_id = p_row.tenant_id and j.project_id = p_row.project_id
      and j.kind = 'client_sheet_images' and j.payload ->> 'sentPackageId' = p_row.id::text);
$$;

revoke all on function private.client_sheet_images_queued(public.sent_package) from public, anon, authenticated, service_role;

create or replace function public.client_page(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.sent_package;
  v_tenant public.tenant;
  v_project public.project;
  v_version_no integer;
  v_rev integer;
begin
  perform private.require_api_gate();

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select * into v_row from public.sent_package s
  where s.token_hash = p_token_hash and s.revoked_at is null and s.expires_at > now()
    and s.kind = 'client'
    and private.billing_mode(s.tenant_id) <> 'locked';
  if not found then
    return null;
  end if;

  select * into v_tenant from public.tenant t where t.id = v_row.tenant_id;
  select * into v_project from public.project p where p.id = v_row.project_id and p.tenant_id = v_row.tenant_id;
  if not found then
    return null;
  end if;

  select m.version_no into v_version_no from public.model_version m
  where m.id = v_row.model_version_id and m.tenant_id = v_row.tenant_id;

  select max(r.rev_no) into v_rev from public.permit_revision r
  where r.model_version_id = v_row.model_version_id and r.project_id = v_row.project_id and r.sent_to = 'client';

  return jsonb_build_object(
    'company', v_tenant.name,
    'company_phone', coalesce(v_tenant.contact ->> 'phone', ''),
    'company_email', coalesce(v_tenant.contact ->> 'email', ''),
    'project_name', v_project.name,
    'project_type', v_project.type,
    'version_no', v_version_no,
    'rev_no', v_rev,
    'sent_at', v_row.created_at,
    'expires_at', v_row.expires_at,
    'shares_sheets', v_row.sheet_set_kind is not null and private.client_sheet_images_queued(v_row),
    'reminder_lead', case
      when (v_tenant.defaults ->> 'share_link_reminder_lead') ~ '^[0-9]{1,3}$'
        then (v_tenant.defaults ->> 'share_link_reminder_lead')::integer
      else 7 end);
end
$$;


create function public.client_sheets(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.sent_package;
  v_job public.job;
begin
  perform private.require_api_gate();

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select * into v_row from public.sent_package s
  where s.token_hash = p_token_hash and s.revoked_at is null and s.expires_at > now()
    and s.kind = 'client'
    and private.billing_mode(s.tenant_id) <> 'locked';
  if not found then
    return null;
  end if;
  if not exists (select 1 from public.project p where p.id = v_row.project_id and p.tenant_id = v_row.tenant_id) then
    return null;
  end if;

  if v_row.sheet_set_kind is null or not private.client_sheet_images_queued(v_row) then
    return jsonb_build_object('status', 'none');
  end if;

  select * into v_job from public.job j
  where j.tenant_id = v_row.tenant_id and j.project_id = v_row.project_id
    and j.kind = 'client_sheet_images' and j.payload ->> 'sentPackageId' = v_row.id::text
    and j.status = 'done'
  order by j.updated_at desc
  limit 1;
  if not found then
    return jsonb_build_object('status', 'preparing');
  end if;

  return jsonb_build_object(
    'status', 'ready',
    'dir', v_job.result -> 'dir',
    'sheets', coalesce(v_job.result -> 'sheets', '[]'::jsonb));
end
$$;

revoke all on function public.client_sheets(text) from public, anon, authenticated, service_role;
grant execute on function public.client_sheets(text) to anon;

comment on function public.client_sheets(text) is
  'The signed-out client page''s Plans tab for an active client link: none, preparing, or ready with the sheet images (EZD-2032). No cost data';

create function public.client_sheet_object_readable(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Guards a direct API call (B9); inside a Storage request it passes, and the next line checks the header there.
  perform private.require_api_gate();
  return private.storage_request_from_server()
    and array_length(storage.foldername(p_name), 1) = 4
    and (storage.foldername(p_name))[3] = 'client-sheets'
    and exists (
      select 1 from public.sent_package s
      where s.id::text = (storage.foldername(p_name))[4]
        and s.tenant_id::text = (storage.foldername(p_name))[1]
        and s.project_id::text = (storage.foldername(p_name))[2]
        and s.kind = 'client'
        and s.sheet_set_kind is not null
        and s.revoked_at is null
        and s.expires_at > now()
        and private.billing_mode(s.tenant_id) <> 'locked');
end
$$;

revoke all on function public.client_sheet_object_readable(text) from public, anon, authenticated, service_role;
grant execute on function public.client_sheet_object_readable(text) to anon;

create policy storage_exports_client_sheets_select on storage.objects
  for select to anon
  using (bucket_id = 'exports' and public.client_sheet_object_readable(name));

comment on function public.client_sheet_object_readable(text) is
  'Storage policy check: the path is a sheet image of a live client link and the request is the server''s (EZD-2032)';

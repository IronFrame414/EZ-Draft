-- EZD-1418 (S17b Desktop side "sent rooms appear in Import review as Field measure items with high confidence;
-- accepting them creates existing walls and rooms"; S02 Entry points "rooms sent from the phone (17b Field measure,
-- source kind field_measure)"; Q-0219 "phase 14 reviews field-measure rooms in Import review"; AC-EZD-1418-1).
--
-- A recorded Send to office (EZD-1417, field_measure_send) becomes one import: a job of kind import, already done
-- (nothing is detected from a file, so no runner claims it), whose id is the send's offline_change id, and one
-- import_session of source_kind field_measure, ready, holding the walls and rooms the server worked out from the sent
-- rooms (app/src/lib/imports/field-measure-items.ts). Import review, Finish import and Cancel import then work on it
-- as on any import (20261118090000). The import has no source file: the sent rooms are kept in field_measure_session
-- and offline_change, so a field_measure session may have no source_file_id.
--
-- The import also opens one review_item of source field_measure (04 Header card review list "field measurements"),
-- source_ref the job id, resolved when Finish or Cancel closes the session.
--
-- No new table: import_session, job and review_item keep their RLS (select by tenant and project scope, member writes
-- only through definer functions). No money fields.

alter table public.import_session alter column source_file_id drop not null;
alter table public.import_session add constraint import_session_source_file_present
  check (source_file_id is not null or source_kind = 'field_measure');
-- One field measure session per import (unique (job_id, source_file_id) does not cover a null source file).
create unique index import_session_field_measure_job_once on public.import_session (job_id)
  where source_file_id is null;

-- create_field_measure_import: the import of one recorded send, by the member who sent it. Gate; no claim or no
-- Send field measurement 42501; project out of scope P0002; a change that is not the caller's field_measure_send on
-- this project, or items that are not 1 to 2500 objects with item ids, 22023. Answers {status, job_id}:
-- created; exists when the send already has its import (a resend after a lost answer); not_sent when the session's
-- sent rooms are not this send's (the send found rooms already sent and changed nothing, 20261121230000).
create function public.create_field_measure_import(p_project uuid, p_change uuid, p_items jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_refusal text;
  v_tenant uuid;
  v_user uuid;
  v_sent uuid;
  v_walls int;
  v_rooms int;
begin
  perform private.require_api_gate();
  v_refusal := private.field_action_refusal(p_project, 'field_measure_send');
  if v_refusal = 'permission_denied' then raise exception 'permission_denied' using errcode = '42501'; end if;
  if v_refusal = 'project_not_found' then raise exception 'project_not_found' using errcode = 'P0002'; end if;
  if v_refusal is not null then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_tenant := private.tenant_id();
  v_user := private.app_user_id();

  if p_change is null or p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 2500
    or octet_length(p_items::text) > 4194304
    or exists (
      select 1 from jsonb_array_elements(p_items) as e
      where jsonb_typeof(e) <> 'object'
        or coalesce(jsonb_typeof(e -> 'id'), '') <> 'string'
        or (e ->> 'id') !~ '^[A-Za-z0-9_.:-]{1,64}$'
        or (e ->> 'type') not in ('wall', 'room'))
    or (select array_length(array_agg(distinct e ->> 'id'), 1) from jsonb_array_elements(p_items) as e)
      <> jsonb_array_length(p_items)
    or not exists (
      select 1 from public.offline_change c
      where c.id = p_change and c.tenant_id = v_tenant and c.project_id = p_project
        and c.kind = 'field_measure_send' and c.app_user_id = v_user)
  then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  -- The session row's lock, so a resend and the first answer create one import between them.
  select s.sent_change_id into v_sent
  from public.field_measure_session s
  where s.project_id = p_project and s.tenant_id = v_tenant
  for update;
  if v_sent is distinct from p_change then
    return jsonb_build_object('status', 'not_sent', 'job_id', null);
  end if;
  if exists (select 1 from public.job j where j.id = p_change) then
    return jsonb_build_object('status', 'exists', 'job_id', p_change);
  end if;

  v_walls := jsonb_array_length(jsonb_path_query_array(p_items, '$[*] ? (@.type == "wall")'));
  v_rooms := jsonb_array_length(jsonb_path_query_array(p_items, '$[*] ? (@.type == "room")'));

  insert into public.job
    (id, tenant_id, project_id, kind, payload, status, progress, max_attempts, created_by, finished_at)
  values
    (p_change, v_tenant, p_project, 'import',
     jsonb_build_object('sourceFileIds', '[]'::jsonb, 'fieldMeasureChangeId', p_change),
     'done', 100, 1, v_user, now());

  insert into public.import_session
    (tenant_id, project_id, source_file_id, job_id, source_kind, status, items, summary)
  values
    (v_tenant, p_project, null, p_change, 'field_measure', 'ready', p_items,
     jsonb_build_object('walls', v_walls, 'openings', 0, 'rooms', v_rooms));

  perform private.add_review_item(p_project, 'field_measure', p_change::text);

  return jsonb_build_object('status', 'created', 'job_id', p_change);
end
$$;

revoke all on function public.create_field_measure_import(uuid, uuid, jsonb) from public, anon;
grant execute on function public.create_field_measure_import(uuid, uuid, jsonb) to authenticated;

-- Finish import or Cancel import closes the session (finished or cancelled): its review_item is resolved.
create function private.resolve_field_measure_review()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.resolve_review_item(new.project_id, 'field_measure', new.job_id::text);
  return null;
end
$$;

revoke all on function private.resolve_field_measure_review() from public;

create trigger import_session_resolve_field_measure_review
  after update of status on public.import_session
  for each row
  when (new.source_kind = 'field_measure' and new.job_id is not null
    and new.status in ('finished', 'cancelled') and old.status is distinct from new.status)
  execute function private.resolve_field_measure_review();

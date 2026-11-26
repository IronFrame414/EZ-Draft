-- EZD-1409 (S17 Tab: Tasks; Task row "checkbox: Marks task done; records user and time. Hidden without Check off
-- tasks. Queued offline"; "add photo: Attaches a photo to the task. Photo notes"; "edit text: Edits the task text.
-- Edit field tasks; online only"; States "Offline: tasks, photos ... queue as offline_change and sync on reconnect";
-- 07 Hooks field_task.completed; vault/build/assumptions/EZD-1409.md).
--
-- A task check is a task_check field action (EZD-1402) whose ops are { taskId, done: true }. When
-- sync_field_action records it, the trigger below applies it in the same transaction: a published task of the same
-- company and project becomes done, by the member who checked it, at the time the phone queued it (the device time,
-- never later than now; sync_field_action clamps it). done_change_id names the action, so the route emits
-- field_task.completed only for the action that completed the task. A task already done, a draft, a task of
-- another project or company, or ops that name no task leave every task unchanged; the action is still recorded,
-- so the phone never holds a check it cannot send (a task the office removed meanwhile).
--
-- A task photo is a new field action kind task_photo (Photo notes) carrying one photo and ops { taskId }; the
-- trigger appends { path, by, at } to the task's photos. Same rules for a task that is not there.
--
-- Editing a task's text from the phone is online only: edit_field_task, a definer function under the member's
-- session. No new table: field_task and offline_change keep their RLS (select by project scope, no member writes).
-- No money fields.

alter table public.field_task
  add column done_change_id uuid references public.offline_change (id) on delete set null,
  add column edited_on_phone_at timestamptz;

create index field_task_done_by_idx on public.field_task (done_by) where done_by is not null;
create index field_task_done_change_idx on public.field_task (done_change_id) where done_change_id is not null;

-- The new kind.
alter table public.offline_change
  drop constraint offline_change_kind_check,
  add constraint offline_change_kind_check check (
    kind in ('measurement', 'task_check', 'photo_pin', 'field_measure_send', 'task_photo'));

-- The switch each kind needs (10 Permissions: Check off tasks, Photo notes, Send field measurement).
create or replace function private.field_action_permission(p_kind text)
returns text language sql immutable set search_path = '' as $$
  select case p_kind
    when 'task_check' then 'check_off_tasks'
    when 'photo_pin' then 'photo_notes'
    when 'task_photo' then 'photo_notes'
    when 'measurement' then 'send_field_measurement'
    when 'field_measure_send' then 'send_field_measurement'
  end;
$$;
revoke all on function private.field_action_permission(text) from public;

-- As 20261121210000, with task_photo among the kinds that carry a photo.
create or replace function private.field_photo_upload_allowed(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_parts text[];
begin
  if p_name is null or p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/field-photos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$' then
    return false;
  end if;
  v_parts := string_to_array(p_name, '/');
  if v_parts[1] is distinct from private.tenant_id()::text then return false; end if;
  if exists (select 1 from public.offline_change c where c.id = left(v_parts[4], 36)::uuid) then return false; end if;
  return private.field_action_refusal(v_parts[2]::uuid, 'photo_pin') is null
    or private.field_action_refusal(v_parts[2]::uuid, 'task_photo') is null
    or private.field_action_refusal(v_parts[2]::uuid, 'task_check') is null
    or private.field_action_refusal(v_parts[2]::uuid, 'measurement') is null;
end $$;
revoke all on function private.field_photo_upload_allowed(text) from public;
grant execute on function private.field_photo_upload_allowed(text) to authenticated;

-- Applies one recorded task_check or task_photo. A task photo with no photo is refused (22023), so nothing is
-- recorded; everything else that names no published or done task of the project is recorded and applies nothing.
create function private.apply_field_task_action()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_task uuid;
begin
  if new.kind = 'task_photo' and new.photo_path is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if coalesce(new.ops ->> 'taskId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return new;
  end if;
  v_task := (new.ops ->> 'taskId')::uuid;

  if new.kind = 'task_check' then
    if new.ops -> 'done' is distinct from 'true'::jsonb then
      return new;
    end if;
    update public.field_task t
      set status = 'done', done_by = new.app_user_id, done_at = new.queued_at, done_change_id = new.id
    where t.id = v_task and t.tenant_id = new.tenant_id and t.project_id = new.project_id
      and t.status = 'published';
  else
    update public.field_task t
      set photos = t.photos || jsonb_build_array(jsonb_build_object(
        'path', new.photo_path, 'by', new.app_user_id, 'at', new.queued_at, 'changeId', new.id))
    where t.id = v_task and t.tenant_id = new.tenant_id and t.project_id = new.project_id
      and t.status in ('published', 'done')
      and jsonb_array_length(t.photos) < 50;
  end if;
  return new;
end
$$;

revoke all on function private.apply_field_task_action() from public;

create trigger offline_change_apply_field_task_action
  after insert on public.offline_change
  for each row when (new.kind in ('task_check', 'task_photo'))
  execute function private.apply_field_task_action();

-- edit_field_task: the phone's Edit text (S17 Task row "Edit field tasks; online only"). Writes the text in the
-- caller's interface language (text_es for a Spanish user, else text_en; assumptions EZD-1503) of a published or
-- done task, and marks it edited on the phone. Returns { textEn, textEs, editedAt }. Gate; no claim or no Edit field
-- tasks 42501; project out of scope, or no such published or done task in it P0002; empty or over-long text 22023.
create function public.edit_field_task(p_project uuid, p_task uuid, p_text text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tenant uuid; v_user uuid; v_membership uuid; v_text text; v_es boolean; v_row public.field_task%rowtype;
begin
  perform private.require_api_gate();
  v_tenant := private.tenant_id();
  v_user := private.app_user_id();
  v_membership := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  if v_tenant is null or v_user is null or v_membership is null or not exists (
      select 1 from public.user_permission up
      where up.membership_id = v_membership and up.tenant_id = v_tenant
        and up.permission_key = 'edit_field_tasks' and up.granted) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_project is null or not private.can_see_project(p_project) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  v_text := btrim(coalesce(p_text, ''));
  if length(v_text) = 0 or length(v_text) > 1000 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select (u.language = 'es') into v_es from public.app_user u where u.id = v_user;
  update public.field_task t
    set text_en = case when coalesce(v_es, false) then t.text_en else v_text end,
        text_es = case when coalesce(v_es, false) then v_text else t.text_es end,
        edited_on_phone_at = now()
  where t.id = p_task and t.tenant_id = v_tenant and t.project_id = p_project
    and t.status in ('published', 'done')
  returning * into v_row;
  if not found then
    raise exception 'task_not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'textEn', v_row.text_en, 'textEs', v_row.text_es, 'editedAt', v_row.edited_on_phone_at);
end $$;
revoke all on function public.edit_field_task(uuid, uuid, text) from public, anon, service_role;
grant execute on function public.edit_field_task(uuid, uuid, text) to authenticated;

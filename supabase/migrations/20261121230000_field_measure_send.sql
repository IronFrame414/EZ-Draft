-- EZD-1417 (S17b Send to office "Sends rooms to the project; office notified. Works offline, queued until online";
-- 07 Hooks field.measure_sent "office notified"; AC-EZD-1417-1 "Measured offline, sent on reconnect, office
-- notified once"; vault/build/assumptions.md EZD-1417). A Send to office is a field_measure_send field action
-- (EZD-1402) whose ops are { rooms }. When sync_field_action records it, the trigger below applies it in the same
-- transaction: the rooms become the project's field_measure_session rooms, the session is marked sent, and each
-- office member gets one field_measurements_received notification. A resend of the same action is answered
-- `duplicate` before any insert, so the trigger never runs twice for one send (notified once).
--
-- No new table: field_measure_session keeps its RLS (select by project scope, no member writes). No money fields.

alter table public.field_measure_session
  add column sent_at timestamptz,
  add column sent_by uuid references public.app_user (id) on delete set null,
  add column sent_change_id uuid references public.offline_change (id) on delete set null;

create index field_measure_session_sent_by_idx on public.field_measure_session (sent_by)
  where sent_by is not null;
create index field_measure_session_sent_change_idx on public.field_measure_session (sent_change_id)
  where sent_change_id is not null;

-- Applies one recorded field_measure_send. Rooms must be an array of 1 to 40 objects of at most 256 KB (as
-- save_field_measure_session; the room fields are checked by the route's schema), else 22023 and nothing is
-- recorded. A session already sent and not reopened (EZD-1419) keeps its sent rooms and notifies no one again.
-- Office: active members of the company, other than the sender, holding Approve field measurements (EZD-1407's
-- rule for field_measurements_received); create_notification applies project scope and each person's settings.
create function private.apply_field_measure_send()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rooms jsonb;
  v_sent timestamptz;
  v_member record;
begin
  v_rooms := new.ops -> 'rooms';
  if v_rooms is null or jsonb_typeof(v_rooms) <> 'array'
    or jsonb_array_length(v_rooms) < 1 or jsonb_array_length(v_rooms) > 40
    or octet_length(v_rooms::text) > 262144
    or exists (select 1 from jsonb_array_elements(v_rooms) as e where jsonb_typeof(e) <> 'object')
  then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select s.sent_at into v_sent
  from public.field_measure_session s
  where s.project_id = new.project_id and s.tenant_id = new.tenant_id
  for update;
  if v_sent is not null then
    return new;
  end if;

  insert into public.field_measure_session as s
    (tenant_id, project_id, rooms, created_by, updated_by, sent_at, sent_by, sent_change_id)
  values
    (new.tenant_id, new.project_id, v_rooms, new.app_user_id, new.app_user_id, new.synced_at, new.app_user_id,
     new.id)
  on conflict (project_id) do update
    set rooms = excluded.rooms,
        updated_by = excluded.updated_by,
        sent_at = excluded.sent_at,
        sent_by = excluded.sent_by,
        sent_change_id = excluded.sent_change_id;

  for v_member in
    select distinct m.user_id
    from public.membership m
    join public.user_permission up
      on up.membership_id = m.id and up.tenant_id = m.tenant_id
     and up.permission_key = 'approve_field_measurements' and up.granted
    where m.tenant_id = new.tenant_id and m.status = 'active' and m.user_id <> new.app_user_id
  loop
    perform private.create_notification(
      new.tenant_id, v_member.user_id, 'field_measurements_received', new.project_id, '{}'::jsonb,
      '/projects/' || new.project_id::text
    );
  end loop;

  return new;
end
$$;

revoke all on function private.apply_field_measure_send() from public;

create trigger offline_change_apply_field_measure_send
  after insert on public.offline_change
  for each row when (new.kind = 'field_measure_send')
  execute function private.apply_field_measure_send();

-- EZD-018 Step 3 (vault/plans/EZD-018.md): broadcasts come only from the database. Later tickets call these
-- from triggers, so an event is pushed only after the change that caused it commits. Payloads carry ids,
-- statuses, counters and timestamps only: never money fields, model data, names or emails (03 rule 2).
-- No API role may execute them (private is not exposed through the API, EZD-006 Step 1).

create function private.broadcast_project(p_project_id uuid, p_event text, p_payload jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_project_id is null or p_event is null or p_payload is null
    or p_event !~ '^[a-z][a-z_]*\.[a-z][a-z_]*$' then
    raise exception 'invalid_broadcast' using errcode = '22023';
  end if;
  perform realtime.send(p_payload, p_event, 'project:' || p_project_id::text, true);
end
$$;

create function private.broadcast_user(p_app_user_id uuid, p_event text, p_payload jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_app_user_id is null or p_event is null or p_payload is null
    or p_event !~ '^[a-z][a-z_]*\.[a-z][a-z_]*$' then
    raise exception 'invalid_broadcast' using errcode = '22023';
  end if;
  perform realtime.send(p_payload, p_event, 'user:' || p_app_user_id::text, true);
end
$$;

revoke all on function private.broadcast_project(uuid, text, jsonb) from public;
revoke all on function private.broadcast_user(uuid, text, jsonb) from public;

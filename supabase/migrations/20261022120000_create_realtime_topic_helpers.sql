-- EZD-018 Step 1 (vault/plans/EZD-018.md): who may receive and who may track presence on a Realtime topic.
-- Topics are project:<project_id> and user:<app_user_id> (lower-case canonical UUID). Realtime evaluates
-- the realtime.messages policies (Step 2) as authenticated with the user's JWT claims, so only
-- authenticated may execute these. pg_default_acl has no row for schema private, so PUBLIC gets execute on
-- a new function unless it is revoked by name (EZD-007a deviation 1).

create function private.realtime_topic_id(topic text, kind text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case when topic ~ ('^' || kind || ':[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    then substr(topic, length(kind) + 2)::uuid end
$$;

create function private.realtime_can_receive(topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if topic like 'project:%' then
    return coalesce(private.can_see_project(private.realtime_topic_id(topic, 'project')), false);
  elsif topic like 'user:%' then
    return coalesce(private.realtime_topic_id(topic, 'user') = private.app_user_id(), false);
  end if;
  return false;
end
$$;

-- No presence on user channels.
create function private.realtime_can_track(topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if topic like 'project:%' then
    return coalesce(private.can_see_project(private.realtime_topic_id(topic, 'project')), false);
  end if;
  return false;
end
$$;

revoke all on function private.realtime_topic_id(text, text) from public;
revoke all on function private.realtime_can_receive(text) from public;
revoke all on function private.realtime_can_track(text) from public;
grant execute on function private.realtime_topic_id(text, text) to authenticated;
grant execute on function private.realtime_can_receive(text) to authenticated;
grant execute on function private.realtime_can_track(text) to authenticated;

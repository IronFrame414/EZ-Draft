-- EZD-143 (vault/plans/EZD-143.md D4; Q-0276 (a)): the only path into public.error_tunnel_throttle. The error
-- tunnel calls it through alertStoreClient(), as anon behind EZD-006's request gate (Q-0087). Limit, one
-- place: 60 tunnel events per address key in a rolling hour. A take that would pass the limit inserts
-- nothing and returns false; otherwise it inserts one row per event and returns true.

create function public.error_tunnel_take(p_ip_key text, p_events integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_ip_key is null or p_ip_key !~ '^[0-9a-f]{64}$' or p_events is null or p_events < 1 then
    raise exception 'invalid_throttle_input' using errcode = '22023';
  end if;

  delete from public.error_tunnel_throttle where at < now() - interval '1 hour';

  -- One take per key at a time, so two envelopes at once cannot both pass the last free slots.
  perform pg_advisory_xact_lock(hashtextextended('error_tunnel_throttle:' || p_ip_key, 0));

  select count(*) into v_count from public.error_tunnel_throttle t
  where t.key_hash = p_ip_key and t.at > now() - interval '1 hour';
  if v_count + p_events > 60 then
    return false;
  end if;

  insert into public.error_tunnel_throttle (key_hash)
  select p_ip_key from generate_series(1, p_events);
  return true;
end
$$;

revoke all on function public.error_tunnel_take(text, integer) from public, anon, authenticated, service_role;
grant execute on function public.error_tunnel_take(text, integer) to anon;

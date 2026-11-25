-- EZD-230 (Q-0038 "each user can set the order of the tools on the rail"; Q-0122 (a) built inside EZD-230): the
-- signed-in user's own tool order on the editor rail, as rail tool ids in order. Empty is the default order. The
-- app puts a tool the list lacks after the listed ones in default order and skips an id it does not know, so an id
-- is checked for form only, not against the tool list.
--
-- app_user stays select-only to authenticated (the app_user_select policy is unchanged: a user's own row and their
-- company's members); update_my_rail_order writes the caller's own row only, behind the API request gate (L-016;
-- 20261027001745_guard_gated_rpcs.sql), and is listed in GATED_RPC_CALLS (app/test-harness/rls/gate.ts). No table
-- or policy is added.

alter table public.app_user
  add column rail_order text[] not null default '{}'
    constraint app_user_rail_order_size check (cardinality(rail_order) <= 64);

create function public.update_my_rail_order(p_order text[])
returns text[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_out text[];
begin
  perform private.require_api_gate();
  v_user := private.app_user_id();
  if v_user is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_order is null
    or cardinality(p_order) > 64
    or array_position(p_order, null) is not null
    or exists (select 1 from unnest(p_order) as t(id) where t.id !~ '^[a-z][a-z0-9-]{0,39}$')
    or exists (
      select 1
      from unnest(p_order) with ordinality as a(id, i)
      join unnest(p_order) with ordinality as b(id, j) on a.id = b.id and a.i < b.j
    ) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  update public.app_user u
  set rail_order = p_order
  where u.id = v_user and u.rail_order is distinct from p_order;

  select u.rail_order into v_out from public.app_user u where u.id = v_user;
  return v_out;
end
$$;

revoke all on function public.update_my_rail_order(text[]) from public, anon, service_role;
grant execute on function public.update_my_rail_order(text[]) to authenticated;

-- EZD-294 Build step 5 (vault/plans/EZD-294.md section 1 SQL M1, Decided "Helper functions"; Q-0625 (a)): the key of a
-- wall or door/window opening, or null; never raises.
create function private.object_number_key(p_type text, p_data jsonb)
returns text language plpgsql immutable parallel safe set search_path = '' as $$
begin
  if jsonb_typeof(p_data -> 'attributes') is distinct from 'object' then return null; end if;
  if p_type = 'wall' then return 'wall'; end if;
  if p_type = 'opening' and jsonb_typeof(p_data #> '{attributes,kind}') = 'string'
    and (p_data #>> '{attributes,kind}') in ('door', 'window') then
    return p_data #>> '{attributes,kind}';
  end if;
  return null;
end $$;
-- EZD-294 (vault/plans/EZD-294.md Decided "Function grants"; L-016): no role executes it directly.
revoke all on function private.object_number_key(text, jsonb) from public;
-- EZD-294 (vault/plans/EZD-294.md Decided "Function grants"): the index evaluates it as the writing role.
grant execute on function private.object_number_key(text, jsonb) to service_role;

-- EZD-294 Build step 5 (vault/plans/EZD-294.md SQL M1, Decided "Helper functions"): the stored whole number 1 to
-- 2^53 - 1 of a keyed row, else null; never raises.
create function private.object_number(p_type text, p_data jsonb)
returns numeric language plpgsql immutable parallel safe set search_path = '' as $$
declare v jsonb := p_data #> '{attributes,number}';
begin
  if private.object_number_key(p_type, p_data) is null or jsonb_typeof(v) is distinct from 'number' then
    return null;
  end if;
  if v::numeric < 1 or v::numeric > 9007199254740991 or v::numeric <> trunc(v::numeric) then return null; end if;
  return v::numeric;
end $$;
-- EZD-294 (vault/plans/EZD-294.md Decided "Function grants"): no role executes it directly.
revoke all on function private.object_number(text, jsonb) from public;
-- EZD-294 (vault/plans/EZD-294.md Decided "Function grants"): the index evaluates it as the writing role.
grant execute on function private.object_number(text, jsonb) to service_role;

-- EZD-294 Build step 5 (vault/plans/EZD-294.md SQL M1, Decided "Backfill"; Q-0625 (a)): numbers the keyed rows of one
-- project (null = every project), deleted included, whose number is missing, JSON null or above 2147483647 (the
-- save_objects bound), in (created_at, object_id) order after the key's highest stored number from 1 to 2147483647;
-- updated_seq and updated_at unchanged. Answers the rows numbered.
create function private.backfill_object_numbers(p_project uuid)
returns integer language plpgsql volatile security invoker set search_path = '' as $$
declare v_count integer;
begin
  with keyed as (
    select o.project_id, o.object_id, o.created_at,
      private.object_number_key(o.type, o.data) as k,
      private.object_number(o.type, o.data) as v,
      o.data #> '{attributes,number}' as num
    from public.model_object o
    where (p_project is null or o.project_id = p_project)
  ), highs as (
    select project_id, k, max(v) as top from keyed where k is not null and v is not null and v <= 2147483647
    group by project_id, k
  ), todo as (
    select project_id, object_id, k,
      row_number() over (partition by project_id, k order by created_at, object_id) as n
    from keyed where k is not null and (num is null or jsonb_typeof(num) = 'null' or v > 2147483647)
  )
  update public.model_object o
  set data = jsonb_set(o.data, '{attributes,number}', to_jsonb(coalesce(h.top, 0) + t.n))
  from todo t left join highs h on h.project_id = t.project_id and h.k = t.k
  where o.project_id = t.project_id and o.object_id = t.object_id;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
-- EZD-294 (vault/plans/EZD-294.md Decided "Function grants"): no role executes it directly.
revoke all on function private.backfill_object_numbers(uuid) from public;

-- EZD-294 Build step 5 (vault/plans/EZD-294.md SQL M1, Decided "Number trigger", "Lookup visibility"; Q-0629 (b)):
-- an update with the same key keeps a stored number from 1 to 2147483647 (the save_objects bound); otherwise the sent
-- number is kept when it is <= 2147483647 and the project has no row with it for that key (deleted included), else
-- the key's highest stored number from 1 to 2147483647 + 1. Definer, so its lookups see every row of the project
-- whichever role writes.
create function private.model_object_number()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare
  v_key text := private.object_number_key(new.type, new.data);
  v_kept numeric;
  v_sent numeric;
  v_top numeric;
begin
  if v_key is null then return new; end if;
  if tg_op = 'UPDATE' and private.object_number_key(old.type, old.data) = v_key then
    v_kept := private.object_number(old.type, old.data);
    if v_kept is not null and v_kept <= 2147483647 then
      new.data := jsonb_set(new.data, '{attributes,number}', to_jsonb(v_kept));
      return new;
    end if;
  end if;
  v_sent := private.object_number(new.type, new.data);
  if v_sent is not null and v_sent <= 2147483647 and not exists (
    select 1 from public.model_object o
    where o.project_id = new.project_id
      and private.object_number_key(o.type, o.data) = v_key
      and private.object_number(o.type, o.data) = v_sent
  ) then
    return new;
  end if;
  select coalesce(max(private.object_number(o.type, o.data)), 0) + 1 into v_top
  from public.model_object o
  where o.project_id = new.project_id and private.object_number_key(o.type, o.data) = v_key
    and private.object_number(o.type, o.data) <= 2147483647;
  if v_top > 2147483647 then
    raise exception 'object_number_out_of_range' using errcode = '22023';
  end if;
  new.data := jsonb_set(new.data, '{attributes,number}', to_jsonb(v_top));
  return new;
end $$;
-- EZD-294 (vault/plans/EZD-294.md Decided "Function grants"): no role executes it directly.
revoke all on function private.model_object_number() from public;

-- EZD-294 (vault/plans/EZD-294.md Decided "Backfill", "Order in M1"): number every project's earlier rows once,
-- before the trigger exists.
select private.backfill_object_numbers(null);

-- EZD-294 (vault/plans/EZD-294.md SQL M1, Decided "Number trigger"): the trigger's two lookups use this index.
create index model_object_number_idx on public.model_object
  (project_id, private.object_number_key(type, data), private.object_number(type, data));

-- EZD-294 (vault/plans/EZD-294.md SQL M1, Decided "Number trigger"): every insert or update of a wall or opening.
create trigger model_object_number
  before insert or update on public.model_object
  for each row when (new.type in ('wall', 'opening'))
  execute function private.model_object_number();

-- EZD-294 (vault/plans/EZD-294.md SQL M1, Decided "Saved number"; Q-0629 (b)): save_objects as in
-- 20261105200004_create_model_save_functions.sql, step (10) also answering each saved object's number.
create or replace function public.save_objects(p_project uuid, p_lock_epoch bigint, p_changes jsonb)
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
  v_epoch bigint;
  v_item jsonb;
  v_keys text[];
  v_deleted boolean;
  v_id uuid;
  v_seen uuid[] := '{}';
  v_conflicts jsonb;
  v_objects jsonb;
begin
  -- (1)
  perform private.require_api_gate();

  -- (2)
  v_tenant := private.tenant_id();
  v_user := private.app_user_id();
  v_membership := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  if v_tenant is null or v_user is null or v_membership is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  -- (3)
  if not exists (
    select 1 from public.user_permission up
    where up.membership_id = v_membership
      and up.tenant_id = v_tenant
      and up.permission_key = 'edit_model'
      and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  -- (4)
  if p_project is null or not private.can_see_project(p_project) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  -- (5) the rules of parseSaveRequest, in snake keys.
  if p_lock_epoch is null or p_lock_epoch < 0
    or p_changes is null or jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) = 0
  then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  for v_item in select e from jsonb_array_elements(p_changes) as e loop
    if jsonb_typeof(v_item) <> 'object' or coalesce(jsonb_typeof(v_item -> 'deleted'), '') <> 'boolean' then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_deleted := (v_item ->> 'deleted')::boolean;
    select array_agg(k order by k) into v_keys from jsonb_object_keys(v_item) as k;
    if v_keys is distinct from (case when v_deleted
        then array['base_seq', 'deleted', 'id']
        else array['base_seq', 'data', 'deleted', 'id', 'schema_version', 'type'] end)
      or coalesce(jsonb_typeof(v_item -> 'id'), '') <> 'string'
      or coalesce((v_item ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', true)
      or coalesce(jsonb_typeof(v_item -> 'base_seq'), '') <> 'number'
    then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    -- Separate statements, so a number is only cast once its JSON type is known.
    if (v_item ->> 'base_seq')::numeric <> trunc((v_item ->> 'base_seq')::numeric)
      or (v_item ->> 'base_seq')::numeric < (case when v_deleted then 1 else 0 end)
      or (v_item ->> 'base_seq')::numeric > 2147483647
    then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    if not v_deleted then
      if coalesce(jsonb_typeof(v_item -> 'type'), '') <> 'string'
        or (v_item ->> 'type') !~ '^[a-z][a-z0-9_]*$'
        or coalesce(jsonb_typeof(v_item -> 'schema_version'), '') <> 'number'
        or coalesce(jsonb_typeof(v_item -> 'data'), '') <> 'object'
      then
        raise exception 'invalid_input' using errcode = '22023';
      end if;
      if (v_item ->> 'schema_version')::numeric <> trunc((v_item ->> 'schema_version')::numeric)
        or (v_item ->> 'schema_version')::numeric < 1
        or (v_item ->> 'schema_version')::numeric > 2147483647
      then
        raise exception 'invalid_input' using errcode = '22023';
      end if;
    end if;
    v_id := (v_item ->> 'id')::uuid;
    if v_id = any (v_seen) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_seen := v_seen || v_id;
  end loop;

  -- (6) one save at a time per project: the edit_lock row is locked for the rest of the transaction.
  select l.lock_epoch into v_epoch from public.edit_lock l where l.project_id = p_project for update;
  if not found then
    if p_lock_epoch <> 0 then
      return jsonb_build_object('status', 'stale_lock_epoch');
    end if;
    insert into public.edit_lock (project_id, tenant_id) values (p_project, v_tenant)
      on conflict (project_id) do nothing;
    select l.lock_epoch into v_epoch from public.edit_lock l where l.project_id = p_project for update;
  end if;

  -- (7)
  if v_epoch <> p_lock_epoch then
    return jsonb_build_object('status', 'stale_lock_epoch');
  end if;

  -- (8)
  select coalesce(
    jsonb_agg(jsonb_build_object('object_id', c.object_id, 'server_seq', coalesce(o.updated_seq, 0))
      order by c.object_id),
    '[]'::jsonb)
  into v_conflicts
  from (
    select (e ->> 'id')::uuid as object_id, (e ->> 'base_seq')::numeric::integer as base_seq
    from jsonb_array_elements(p_changes) as e
  ) c
  left join public.model_object o on o.project_id = p_project and o.object_id = c.object_id
  where c.base_seq <> coalesce(o.updated_seq, 0);

  if jsonb_array_length(v_conflicts) > 0 then
    return jsonb_build_object('status', 'conflict', 'conflicts', v_conflicts);
  end if;

  -- (9) no count cap.
  insert into public.model_object
    (project_id, object_id, tenant_id, type, data, schema_version, updated_seq, updated_by, deleted)
  select p_project, (e ->> 'id')::uuid, v_tenant, e ->> 'type', e -> 'data', (e ->> 'schema_version')::numeric::integer,
    1, v_user, (e ->> 'deleted')::boolean
  from jsonb_array_elements(p_changes) as e
  where (e ->> 'base_seq')::numeric::integer = 0;

  update public.model_object o
  set type = coalesce(c.e ->> 'type', o.type),
      data = coalesce(c.e -> 'data', o.data),
      schema_version = coalesce((c.e ->> 'schema_version')::numeric::integer, o.schema_version),
      deleted = (c.e ->> 'deleted')::boolean,
      updated_seq = o.updated_seq + 1,
      updated_at = now(),
      updated_by = v_user
  from (
    select e, (e ->> 'id')::uuid as object_id
    from jsonb_array_elements(p_changes) as e
    where (e ->> 'base_seq')::numeric::integer > 0
  ) c
  where o.project_id = p_project and o.object_id = c.object_id;

  -- (10)
  select coalesce(
    jsonb_agg(jsonb_build_object('object_id', o.object_id, 'updated_seq', o.updated_seq, 'number', private.object_number(o.type, o.data))
      order by o.object_id),
    '[]'::jsonb)
  into v_objects
  from public.model_object o
  where o.project_id = p_project and o.object_id = any (v_seen);

  return jsonb_build_object('status', 'saved', 'tenant_id', v_tenant, 'objects', v_objects);
end
$$;

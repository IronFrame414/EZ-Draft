-- EZD-1102 (S15f; Q-0210; 13b R2; AC-EZD-1102-1): save_render_settings(p_tiers, p_allowance), the one write of
-- Settings > Render models. It checks settings_render_models (42501); dollar figures (a tier cost or the
-- allowance) also need see_company_costs (42501). All three tiers must have a model in one call (22023
-- tier_model_required, AC-EZD-1102-1), so a partial set never lands. `changed` lists the tiers whose row changed
-- and 'allowance'.

-- A positive or zero dollar amount with at most two decimals and below the column limits; null otherwise.
create function private.render_dollars(p_value jsonb, p_positive boolean)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v numeric;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'number' then
    return null;
  end if;
  v := (p_value #>> '{}')::numeric;
  if v <> round(v, 2) or v < 0 or (p_positive and v = 0) or v >= 1000000 then
    return null;
  end if;
  return v;
end
$$;
revoke all on function private.render_dollars(jsonb, boolean) from public, anon, authenticated, service_role;

create function public.save_render_settings(p_tiers jsonb, p_allowance jsonb default null)
returns table (tenant_id uuid, changed text[])
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.tenant_id();
  v_membership uuid := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  v_costs boolean;
  v_item jsonb;
  v_tier text;
  v_seen text[] := array[]::text[];
  v_cost numeric;
  v_old public.render_tier_model;
  v_new_cost numeric;
  v_amount numeric;
  v_refill numeric;
  v_allow public.render_allowance;
  v_changed text[] := array[]::text[];
begin
  perform private.require_api_gate();
  if v_tenant is null or v_membership is null or not exists (
    select 1 from public.user_permission up
    join public.membership m on m.id = up.membership_id and m.tenant_id = up.tenant_id
    where up.membership_id = v_membership and up.tenant_id = v_tenant and m.status = 'active'
      and up.permission_key = 'settings_render_models' and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  v_costs := exists (
    select 1 from public.user_permission up
    where up.membership_id = v_membership and up.tenant_id = v_tenant
      and up.permission_key = 'see_company_costs' and up.granted);

  -- The shape: an array of tier objects; every tier once, each with a model (AC-EZD-1102-1).
  if p_tiers is null or jsonb_typeof(p_tiers) <> 'array' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  for v_item in select e from jsonb_array_elements(p_tiers) as e loop
    if jsonb_typeof(v_item) <> 'object'
        or jsonb_typeof(v_item -> 'tier') is distinct from 'string'
        or (v_item ->> 'tier') not in ('fast', 'standard', 'photoreal')
        or (v_item ->> 'tier') = any (v_seen) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    if jsonb_typeof(v_item -> 'provider') is distinct from 'string'
        or jsonb_typeof(v_item -> 'model_id') is distinct from 'string'
        or jsonb_typeof(v_item -> 'output_size') is distinct from 'string'
        or btrim(v_item ->> 'model_id') = '' then
      raise exception 'tier_model_required' using errcode = '22023';
    end if;
    if (v_item ->> 'provider') not in ('gemini', 'openai', 'bfl', 'stub')
        or (v_item ->> 'model_id') !~ '^[a-z0-9][a-z0-9.\-]{0,99}$'
        or (v_item ->> 'output_size') not in ('1k', '2k', '4k') then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    if v_item ? 'cost_usd_per_render' and jsonb_typeof(v_item -> 'cost_usd_per_render') <> 'null' then
      if not v_costs then
        raise exception 'permission_denied' using errcode = '42501';
      end if;
      if private.render_dollars(v_item -> 'cost_usd_per_render', false) is null then
        raise exception 'invalid_input' using errcode = '22023';
      end if;
    end if;
    v_seen := array_append(v_seen, v_item ->> 'tier');
  end loop;
  if cardinality(v_seen) <> 3 then
    raise exception 'tier_model_required' using errcode = '22023';
  end if;

  if p_allowance is not null and jsonb_typeof(p_allowance) <> 'null' then
    if not v_costs then
      raise exception 'permission_denied' using errcode = '42501';
    end if;
    if jsonb_typeof(p_allowance) <> 'object' then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_amount := private.render_dollars(p_allowance -> 'amount_usd', true);
    v_refill := private.render_dollars(p_allowance -> 'refill_amount_usd', true);
    if v_amount is null or v_refill is null then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
  end if;

  -- One save at a time per company.
  perform 1 from public.tenant t where t.id = v_tenant for update;

  for v_item in select e from jsonb_array_elements(p_tiers) as e loop
    v_tier := v_item ->> 'tier';
    select * into v_old from public.render_tier_model r where r.tenant_id = v_tenant and r.tier = v_tier;
    -- A cost key that is missing leaves the stored cost (a member without see_company_costs never sends one).
    v_cost := private.render_dollars(v_item -> 'cost_usd_per_render', false);
    v_new_cost := case when v_item ? 'cost_usd_per_render' then v_cost else v_old.cost_usd_per_render end;
    if v_old.tier is null then
      insert into public.render_tier_model (tenant_id, tier, provider, model_id, output_size, cost_usd_per_render)
      values (v_tenant, v_tier, v_item ->> 'provider', v_item ->> 'model_id', v_item ->> 'output_size', v_new_cost);
      v_changed := array_append(v_changed, v_tier);
    elsif v_old.provider is distinct from (v_item ->> 'provider')
        or v_old.model_id is distinct from (v_item ->> 'model_id')
        or v_old.output_size is distinct from (v_item ->> 'output_size')
        or v_old.cost_usd_per_render is distinct from v_new_cost then
      update public.render_tier_model r
      set provider = v_item ->> 'provider', model_id = v_item ->> 'model_id',
        output_size = v_item ->> 'output_size', cost_usd_per_render = v_new_cost
      where r.tenant_id = v_tenant and r.tier = v_tier;
      v_changed := array_append(v_changed, v_tier);
    end if;
  end loop;

  if v_amount is not null then
    select * into v_allow from public.render_allowance a where a.tenant_id = v_tenant;
    if v_allow.tenant_id is null then
      insert into public.render_allowance (tenant_id, amount_usd, balance_usd, refill_amount_usd, last_refilled_at)
      values (v_tenant, v_amount, v_amount, v_refill, now());
      v_changed := array_append(v_changed, 'allowance');
    elsif v_allow.amount_usd <> v_amount or v_allow.refill_amount_usd <> v_refill then
      -- What was spent since the last refill stays spent (vault/build/assumptions.md EZD-1102).
      update public.render_allowance a
      set amount_usd = v_amount, balance_usd = v_allow.balance_usd + (v_amount - v_allow.amount_usd),
        refill_amount_usd = v_refill
      where a.tenant_id = v_tenant;
      v_changed := array_append(v_changed, 'allowance');
    end if;
  end if;

  return query select v_tenant, v_changed;
end
$$;
revoke all on function public.save_render_settings(jsonb, jsonb) from public, anon, service_role;
grant execute on function public.save_render_settings(jsonb, jsonb) to authenticated;

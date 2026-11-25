-- EZD-417 (03c selection_offer "project_id, kind (edge_profile, option group, finish), choices[], price_deltas | What
-- the client may pick from"; S04b Edit offered edges "Choose which profiles the client sees and enter the price
-- difference per lf ... Requires Send to client"; S04b Events emitted "edge_profile.offered (new)"; 13b R2;
-- vault/build/assumptions.md EZD-417). The edge profile library is 20261122160000_edge_profile.sql; items 2 and 3
-- of its header describe this file.

-- 2. selection_offer.
create table public.selection_offer (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  project_id uuid not null,
  kind text not null check (kind in ('edge_profile', 'option_group', 'finish')),
  subject_id uuid not null,
  choices uuid[] not null check (cardinality(choices) between 1 and 50 and array_position(choices, null) is null),
  -- 03c price_deltas: the price difference of each choice, per LF for an edge profile. A sell price (13b R2).
  price_deltas numeric(10, 2)[] not null check (
    cardinality(price_deltas) = cardinality(choices) and array_position(price_deltas, null) is null
  ),
  status text not null default 'open' check (status in ('open', 'chosen')),
  offered_by uuid references public.app_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, tenant_id) references public.project (id, tenant_id) on delete cascade,
  unique (project_id, kind, subject_id)
);

create index selection_offer_tenant_idx on public.selection_offer (tenant_id);

alter table public.selection_offer enable row level security;

create trigger selection_offer_set_updated_at before update on public.selection_offer
  for each row execute function public.set_updated_at();

-- EZD-006 policy template: tenant from the claim, then project scope. Policies never read permission rows
-- (EZD-102), so See sell prices is checked by the routes that return rates, as for catalog_item.sell_price.
create policy selection_offer_select on public.selection_offer for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
  );

create policy selection_offer_api_gate on public.selection_offer as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

-- The standard grant (EZD-006 Step 6); with no insert, update or delete policy RLS refuses every member write.
-- Writes go through save_edge_offer.
grant select, insert, update, delete on public.selection_offer to authenticated;
grant select, insert, update, delete on public.selection_offer to service_role;

comment on table public.selection_offer is 'Data model entity: selection_offer (03c; EZD-417). price_deltas are sell prices.';

-- 3. Edit offered edges.
create function public.save_edge_offer(
  p_project uuid,
  p_piece uuid,
  p_choices uuid[],
  p_rates numeric[] default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_old public.selection_offer;
  v_rates numeric(10, 2)[];
  v_row public.selection_offer;
  v_i integer;
  v_at integer;
begin
  perform private.require_api_gate();
  perform private.require_send_to_client();
  v_tenant := private.tenant_id();
  v_user := private.app_user_id();

  if p_project is null or not private.can_see_project(p_project) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.project p where p.id = p_project and p.tenant_id = v_tenant) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if p_piece is null or p_choices is null or array_position(p_choices, null) is not null
    or cardinality(p_choices) > 7
    or cardinality(array(select distinct c from unnest(p_choices) c)) <> cardinality(p_choices) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_rates is not null and (
    cardinality(p_rates) <> cardinality(p_choices)
    or array_position(p_rates, null) is not null
    or exists (select 1 from unnest(p_rates) r where r < 0 or r > 99999.99 or r <> round(r, 2))
  ) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  -- Every choice is one of the company's own profiles.
  if exists (
    select 1 from unnest(p_choices) c
    where not exists (select 1 from public.edge_profile e where e.tenant_id = v_tenant and e.id = c)
  ) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select * into v_old from public.selection_offer o
  where o.project_id = p_project and o.kind = 'edge_profile' and o.subject_id = p_piece
  for update;

  if cardinality(p_choices) = 0 then
    if v_old.id is not null then
      delete from public.selection_offer o where o.id = v_old.id;
    end if;
    return jsonb_build_object('offer', null);
  end if;

  if p_rates is not null then
    v_rates := p_rates;
  else
    v_rates := array[]::numeric(10, 2)[];
    for v_i in 1 .. cardinality(p_choices) loop
      v_at := case when v_old.id is null then null else array_position(v_old.choices, p_choices[v_i]) end;
      v_rates := v_rates || coalesce(v_old.price_deltas[v_at], 0)::numeric(10, 2);
    end loop;
  end if;

  insert into public.selection_offer as o (tenant_id, project_id, kind, subject_id, choices, price_deltas,
    status, offered_by)
  values (v_tenant, p_project, 'edge_profile', p_piece, p_choices, v_rates, 'open', v_user)
  on conflict (project_id, kind, subject_id) do update
    set choices = excluded.choices,
        price_deltas = excluded.price_deltas,
        status = 'open',
        offered_by = excluded.offered_by
  returning * into v_row;

  -- Ids only: the rates are sell prices and the event log is read without See sell prices.
  perform private.write_event_log_as('edge_profile.offered', v_tenant, v_user, 'selection_offer', v_row.id,
    jsonb_build_object('projectId', p_project, 'pieceId', p_piece, 'choices', to_jsonb(p_choices)), null);

  return jsonb_build_object('offer', jsonb_build_object(
    'id', v_row.id,
    'subject_id', v_row.subject_id,
    'choices', to_jsonb(v_row.choices),
    'price_deltas', to_jsonb(v_row.price_deltas),
    'status', v_row.status));
end
$$;

revoke all on function public.save_edge_offer(uuid, uuid, uuid[], numeric[])
  from public, anon, authenticated, service_role;
grant execute on function public.save_edge_offer(uuid, uuid, uuid[], numeric[]) to authenticated;

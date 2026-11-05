-- EZD-118 Build step 1 (vault/plans/EZD-118.md section 1, M1): the only project write path (03b rule 1). A new
-- project starts as `draft` with `settings` `{}` (Q-0403); `code_edition` and `submittal_profile_id` stay null
-- (Q-0399); `client_name` is not written. The Create projects check runs here for the member of the session's
-- `membership_id` claim, never a parameter (Q-0451 (a)); a `listed` member gets one `membership_project` row in
-- the same transaction. Errors: 42501 `permission_denied`, 22023 `invalid_input` / `customer_unavailable`.
-- Executable by authenticated only (ARCH Function grants convention; L-016); listed in GATED_RPC_CALLS.
create function public.create_project(p_name text, p_address text, p_type text, p_customer_id uuid, p_scope_of_work text)
returns table (project_id uuid, tenant_id uuid)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid; v_membership uuid := nullif(auth.jwt() ->> 'membership_id', '')::uuid; v_scope text; v_id uuid;
begin
  perform private.require_api_gate();
  v_tenant := private.tenant_id();
  if v_tenant is null or v_membership is null then raise exception 'permission_denied' using errcode = '42501'; end if;
  select m.scope into v_scope from public.membership m
    where m.id = v_membership and m.tenant_id = v_tenant and m.status = 'active';
  if v_scope is null then raise exception 'permission_denied' using errcode = '42501'; end if;
  if not exists (select 1 from public.user_permission up where up.membership_id = v_membership
      and up.tenant_id = v_tenant and up.permission_key = 'create_projects' and up.granted) then
    raise exception 'permission_denied' using errcode = '42501'; end if;
  if p_name is null or length(btrim(p_name)) = 0 or p_address is null or length(btrim(p_address)) = 0
     or p_type is null or p_type not in ('kitchen', 'bath', 'whole_home_interior') then
    raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_customer_id is not null and not exists (select 1 from public.customer c
      where c.id = p_customer_id and c.tenant_id = v_tenant and c.archived_at is null) then
    raise exception 'customer_unavailable' using errcode = '22023'; end if;
  insert into public.project (tenant_id, name, address, type, customer_id, scope_of_work)
    values (v_tenant, p_name, p_address, p_type, p_customer_id, p_scope_of_work) returning id into v_id;
  if v_scope = 'listed' then
    insert into public.membership_project (tenant_id, membership_id, project_id) values (v_tenant, v_membership, v_id);
  end if;
  return query select v_id, v_tenant;
end $$;
revoke all on function public.create_project(text, text, text, uuid, text) from public, anon, service_role;
grant execute on function public.create_project(text, text, text, uuid, text) to authenticated;

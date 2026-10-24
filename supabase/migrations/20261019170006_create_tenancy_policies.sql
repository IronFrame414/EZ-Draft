-- EZD-006 Step 5 (vault/plans/EZD-006.md; 03 intro; 03 rule 1; 11 rule 10; 11 Security): the policies
-- on the five tenancy tables. All to authenticated; anon gets none. Helpers are always wrapped in a
-- scalar subquery so they run once per statement. RLS checks tenant and project scope only, never
-- permission rows (EZD-102). The four tenancy tables are read-only to authenticated (grants in the
-- next migration); project is the writable one.
--
-- Template for later tables (tenant_id and project_id): every USING and WITH CHECK is
--   tenant_id = (select private.tenant_id())
--   and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
-- optionally `and` more conditions; a table with tenant_id only uses the first clause.

create policy tenant_select on public.tenant
  for select to authenticated
  using (id = (select private.tenant_id()));

create policy app_user_select on public.app_user
  for select to authenticated
  using (
    id = (select private.app_user_id())
    or id = any ((select private.tenant_user_ids())::uuid[])
  );

create policy membership_select on public.membership
  for select to authenticated
  using (tenant_id = (select private.tenant_id()));

create policy membership_project_select on public.membership_project
  for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
  );

create policy project_select on public.project
  for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or id = any ((select private.listed_project_ids())::uuid[]))
  );

create policy project_insert on public.project
  for insert to authenticated
  with check (tenant_id = (select private.tenant_id()));

create policy project_update on public.project
  for update to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or id = any ((select private.listed_project_ids())::uuid[]))
  )
  with check (tenant_id = (select private.tenant_id()));

create policy project_delete on public.project
  for delete to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or id = any ((select private.listed_project_ids())::uuid[]))
  );

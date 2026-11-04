-- EZD-190 Step 2 (vault/plans/EZD-190.md section 3; Q-0330): the restrictive policy <table>_api_gate on
-- every public table authenticated can reach. A statement that came through PostgREST without the server
-- gate header raises 42501 api_gate for any row that passes the table's own policies (no row: an empty
-- result), even when PostgREST serves without pgrst.db_pre_request. Never runs for anon (no table
-- privilege), service_role or postgres (bypass RLS); Storage requests pass (storage.operation set).

create policy tenant_api_gate on public.tenant as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

create policy app_user_api_gate on public.app_user as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

create policy membership_api_gate on public.membership as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

create policy membership_project_api_gate on public.membership_project as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

create policy project_api_gate on public.project as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

create policy job_api_gate on public.job as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

create policy error_alert_api_gate on public.error_alert as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

create policy role_api_gate on public.role as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

create policy user_permission_api_gate on public.user_permission as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

create policy source_file_api_gate on public.source_file as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

create policy customer_api_gate on public.customer as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

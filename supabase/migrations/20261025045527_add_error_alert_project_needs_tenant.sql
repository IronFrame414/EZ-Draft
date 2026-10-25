-- EZD-144 (vault/plans/EZD-144.md; Q-0268 sweep item 4): a row with a project always has a company.
-- The composite foreign key (project_id, tenant_id) is MATCH SIMPLE, so with tenant_id null it checks nothing,
-- and the existing check ties only kind to tenant; this check closes the gap for every caller, service_role included.
alter table public.error_alert add constraint error_alert_project_needs_tenant check (tenant_id is not null or project_id is null);

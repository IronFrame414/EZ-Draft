-- EZD-1202 (S18 Layout, States; Q-0700 03 row; 03b rule 11; vault/build/assumptions/EZD-1202.md Settled "Where the
-- page and its data come from"): the signed-out client page's fixed field list for an active client link. The same
-- filters as resolve_sent_package (not revoked, not expired, company not locked). It reads tenant, project,
-- model_version and permit_revision only: no money table, no cost column. The status (expired with the company
-- name, unavailable, not found) and the share_link.viewed row stay with resolve_share_link.
--
-- Answer (null for any link that is not active):
--   company, company_phone, company_email   tenant name and contact phone and email ('' when not set)
--   project_name, project_type
--   version_no, rev_no                      Version N; rev_no the client Rev this send took (EZD-719), else null
--   sent_at, expires_at
--   shares_sheets                           the send went out with a sheet set (Plans tab, EZD-1205)
--   reminder_lead                           the company's Share link reminder lead in days (registry default 7)

create function public.client_page(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.sent_package;
  v_tenant public.tenant;
  v_project public.project;
  v_version_no integer;
  v_rev integer;
begin
  perform private.require_api_gate();

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select * into v_row from public.sent_package s
  where s.token_hash = p_token_hash and s.revoked_at is null and s.expires_at > now()
    and s.kind = 'client'
    and private.billing_mode(s.tenant_id) <> 'locked';
  if not found then
    return null;
  end if;

  select * into v_tenant from public.tenant t where t.id = v_row.tenant_id;
  select * into v_project from public.project p where p.id = v_row.project_id and p.tenant_id = v_row.tenant_id;
  if not found then
    return null;
  end if;

  select m.version_no into v_version_no from public.model_version m
  where m.id = v_row.model_version_id and m.tenant_id = v_row.tenant_id;

  select max(r.rev_no) into v_rev from public.permit_revision r
  where r.model_version_id = v_row.model_version_id and r.project_id = v_row.project_id and r.sent_to = 'client';

  return jsonb_build_object(
    'company', v_tenant.name,
    'company_phone', coalesce(v_tenant.contact ->> 'phone', ''),
    'company_email', coalesce(v_tenant.contact ->> 'email', ''),
    'project_name', v_project.name,
    'project_type', v_project.type,
    'version_no', v_version_no,
    'rev_no', v_rev,
    'sent_at', v_row.created_at,
    'expires_at', v_row.expires_at,
    'shares_sheets', v_row.sheet_set_kind is not null,
    'reminder_lead', case
      when (v_tenant.defaults ->> 'share_link_reminder_lead') ~ '^[0-9]{1,3}$'
        then (v_tenant.defaults ->> 'share_link_reminder_lead')::integer
      else 7 end);
end
$$;

revoke all on function public.client_page(text) from public, anon, authenticated, service_role;
grant execute on function public.client_page(text) to anon;

comment on function public.client_page(text) is
  'The signed-out client page''s fields for an active client link: company, contact, project, version label, dates (EZD-1202). No cost data';

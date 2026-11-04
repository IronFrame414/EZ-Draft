-- EZD-101 Step 1 (vault/plans/EZD-101.md): the 37 permission keys and the four preset sets (10 preset table;
-- S15 Permission list; Q-0223, Q-0224, Q-0225, Q-0234, Q-0235). The key list is also written as a literal in the
-- check constraints of role and user_permission, because a check calling a private function fails as authenticated.
create function private.permission_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['view_projects','create_projects','edit_model','delete_projects','upload_references','add_markup','run_code_check','run_fast_renders','run_standard_renders','run_photoreal_renders','approve_renders','mark_client_ready','see_company_costs','see_sell_prices','edit_catalog','create_change_orders','flag_to_supplier','issue_permit_sets','issue_revisions','send_to_client','export','edit_field_tasks','check_off_tasks','photo_notes','flag_conflict','send_field_measurement','approve_field_measurements','settings_company','settings_users','settings_title_block','settings_sheet_presets','settings_defaults','settings_catalog','settings_render_models','settings_code_edition','settings_libraries','settings_system_status']::text[]
$$;

revoke all on function private.permission_keys() from public;

create function private.preset_permissions(p_preset text)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
begin
  case p_preset
    when 'owner' then
      return private.permission_keys();
    when 'designer' then
      return array['view_projects','create_projects','edit_model','upload_references','add_markup','run_code_check','run_fast_renders','run_standard_renders','run_photoreal_renders','approve_renders','mark_client_ready','see_company_costs','see_sell_prices','edit_catalog','create_change_orders','flag_to_supplier','send_to_client','export','edit_field_tasks','check_off_tasks','photo_notes','flag_conflict','send_field_measurement','approve_field_measurements','settings_catalog','settings_libraries']::text[];
    when 'foreman' then
      return array['view_projects','create_projects','add_markup','run_fast_renders','export','edit_field_tasks','check_off_tasks','photo_notes','flag_conflict','send_field_measurement','settings_libraries']::text[];
    when 'crew' then
      return array['view_projects','check_off_tasks','photo_notes','flag_conflict']::text[];
    else
      raise exception 'unknown_preset' using errcode = '22023';
  end case;
end;
$$;

revoke all on function private.preset_permissions(text) from public;

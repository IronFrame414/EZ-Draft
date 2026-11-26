-- EZD-1611a (09i Takeoff rules: "Every number named here is a Defaults value the owner can change";
-- vault/build/assumptions/EZD-1611a.md): Settings > Defaults gains drywall_sheet (a choice, string) and paint_coats,
-- paint_coverage and tile_box_coverage (whole numbers) for the takeoff. Same lists as 20261126180000 plus those four; the
-- route checks the values from the TypeScript registry (registry-sql.test.ts reads the newest definition). None is per
-- project, so create_project's copy check is unchanged. No table, policy or grant changes; update_tenant_defaults is
-- unchanged and calls this.

create or replace function private.defaults_key_type(p_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_key in ('plan_dimension_rounding', 'detail_dimension_rounding', 'cabinet_autofill_increment',
      'countertop_increment', 'snap_increment', 'wall_thickness', 'wall_drywall_each_side', 'wall_height',
      'wall_exterior_block', 'measurement_tolerance', 'high_confidence_cutoff', 'cabinet_fit_tolerance',
      'reference_change_tolerance', 'leader_snap_tolerance', 'walk_eye_height', 'overhang_standard',
      'overhang_seating_counter', 'overhang_seating_bar', 'overhang_against_wall', 'seating_support_limit',
      'countertop_bracket_spacing', 'countertop_seat_width',
      'fan_blade_clearance', 'load_warning_threshold', 'voltage_drop_warning', 'waste_tile', 'waste_lvp',
      'waste_drywall', 'waste_paint', 'waste_trim', 'waste_countertop', 'pattern_straight', 'pattern_diagonal',
      'pattern_herringbone', 'recently_added_window', 'version_cleanup_age', 'version_cleanup_grace',
      'edit_lock_auto_release', 'share_link_expiry', 'share_link_reminder_lead', 'webhook_retries',
      'device_cache_budget', 'light_cu', 'light_llf', 'paint_coats', 'paint_coverage', 'tile_box_coverage')
      then 'number'
    when p_key in ('ipad_input', 'wall_stud', 'act_min_border', 'drywall_sheet') then 'string'
    when p_key in ('device_height_notes') then 'boolean'
    when p_key in ('detail_scales') then 'array'
    when p_key in ('field_measure_range', 'keyboard_shortcuts', 'light_targets') then 'object'
    else null
  end
$$;
revoke all on function private.defaults_key_type(text) from public, anon, authenticated, service_role;

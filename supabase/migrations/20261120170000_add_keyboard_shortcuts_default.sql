-- EZD-222 (S15d Keyboard shortcuts; phase-02.md EZD-222): Settings > Defaults gains keyboard_shortcuts, the
-- owner's changes to the default key map as one JSON object { <command>: <key> } ('' is a cleared row). Same
-- lists as 20261120134000 plus that key as an object; the route checks the commands, keys and collisions from
-- the TypeScript registry (app/src/lib/defaults/shortcuts.ts; registry-sql.test.ts reads the newest definition).
-- No table, policy or grant changes; update_tenant_defaults is unchanged and calls this function.

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
      'fan_blade_clearance', 'load_warning_threshold', 'voltage_drop_warning', 'waste_tile', 'waste_lvp',
      'waste_drywall', 'waste_paint', 'waste_trim', 'waste_countertop', 'pattern_straight', 'pattern_diagonal',
      'pattern_herringbone', 'recently_added_window', 'version_cleanup_age', 'version_cleanup_grace',
      'edit_lock_auto_release', 'share_link_expiry', 'share_link_reminder_lead', 'webhook_retries',
      'device_cache_budget')
      then 'number'
    when p_key in ('ipad_input', 'wall_stud', 'act_min_border') then 'string'
    when p_key in ('device_height_notes') then 'boolean'
    when p_key in ('detail_scales') then 'array'
    when p_key in ('field_measure_range', 'keyboard_shortcuts') then 'object'
    else null
  end
$$;
revoke all on function private.defaults_key_type(text) from public, anon, authenticated, service_role;

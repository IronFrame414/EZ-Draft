// EZD-116 (AC-EZD-116-1, -2, -4, -7). Expected values: S15d Controls rows and Validation; board S15dDefaults
// groups; Q-0697 decisions 03 "Defaults data" (per-project keys; effective value) and 05 (Walls group after
// Increments, Snap increment default 1/2", cleanup age 30 and grace 7 as two keys, no Keyboard shortcuts);
// Q-0558 (2x4, 1/2" drywall, 4 1/2" thick, 8' 0" high); Q-0706 (days 1 to 365, 0 for cleanup, reminder lead
// below expiry); Q-0561 (lengths); 09o Value checks, Effective value, Copy at creation.
import { ROOM_TYPES } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import {
  DEFAULTS_REGISTRY,
  DEFAULT_COLUMNS,
  DEFAULT_GROUPS,
  PER_PROJECT_KEYS,
  STORABLE_KEYS,
  defaultRow,
} from './registry';
import {
  checkValue,
  crossCheck,
  effectiveDefaults,
  effectiveValue,
  formValueOf,
  parseFormValue,
  projectDefaultsCopy,
} from './values';

const row = (key: string) => {
  const r = defaultRow(key);
  if (!r) throw new Error(`no row ${key}`);
  return r;
};
const parse = (key: string, text: string) => parseFormValue(row(key), text);

describe('EZD-116 registry (AC-EZD-116-2)', () => {
  it('lists every S15d row in the board groups, Walls after Increments, Keyboard shortcuts last', () => {
    expect(DEFAULT_GROUPS).toEqual([
      'units',
      'increments',
      'walls',
      'tolerances',
      'three_d',
      'countertops',
      'ceilings',
      'electrical',
      'baths',
      'details',
      'waste',
      'catalog',
      'history',
      'client',
      'integrations',
      'keyboard_shortcuts',
    ]);
    // EZD-222: Keyboard shortcuts is a table under the three columns.
    expect(DEFAULT_COLUMNS.flat()).toHaveLength(DEFAULT_GROUPS.length - 1);
    expect(DEFAULT_COLUMNS.flat()).not.toContain('keyboard_shortcuts');
    const keys = DEFAULTS_REGISTRY.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    // S15d Controls, one key per row (row 44 is two keys), plus Walls and Snap increment.
    for (const k of [
      'units_display',
      'plan_dimension_rounding',
      'detail_dimension_rounding',
      'ipad_input',
      'cabinet_autofill_increment',
      'countertop_increment',
      'snap_increment',
      'wall_thickness',
      'wall_stud',
      'wall_drywall_each_side',
      'wall_height',
      'wall_exterior_block',
      'measurement_tolerance',
      'high_confidence_cutoff',
      'cabinet_fit_tolerance',
      'reference_change_tolerance',
      'leader_snap_tolerance',
      'field_measure_range',
      'overhang_standard',
      'overhang_seating_counter',
      'overhang_seating_bar',
      'overhang_against_wall',
      'seating_support_limit',
      'act_min_border',
      'fan_blade_clearance',
      'light_targets',
      'load_warning_threshold',
      'voltage_drop_warning',
      'device_height_notes',
      'bath_clearances',
      'walk_eye_height',
      'detail_scales',
      'waste_tile',
      'waste_lvp',
      'waste_drywall',
      'waste_paint',
      'waste_trim',
      'waste_countertop',
      'pattern_straight',
      'pattern_diagonal',
      'pattern_herringbone',
      'recently_added_window',
      'version_cleanup_age',
      'version_cleanup_grace',
      'edit_lock_auto_release',
      'share_link_expiry',
      'share_link_reminder_lead',
      'webhook_retries',
    ]) {
      expect(keys, k).toContain(k);
    }
    // EZD-222: the one Keyboard shortcuts row holds the whole key map.
    expect(DEFAULTS_REGISTRY.filter((r) => r.group === 'keyboard_shortcuts').map((r) => r.key)).toEqual([
      'keyboard_shortcuts',
    ]);
    for (const r of DEFAULTS_REGISTRY) {
      expect(r.label, r.key).toMatch(/^office\.defaults\.row\./);
      expect(DEFAULT_GROUPS, r.key).toContain(r.group);
    }
    // Walls is the group after Increments; Snap is under Increments.
    expect(row('snap_increment').group).toBe('increments');
    expect(row('wall_height').group).toBe('walls');
  });

  it('carries the sourced defaults and leaves owner-entered rows empty', () => {
    expect(row('cabinet_autofill_increment').default).toBe(3);
    expect(row('countertop_increment').default).toBe(0.5);
    expect(row('snap_increment').default).toBe(0.5);
    expect(row('plan_dimension_rounding').default).toBe(0.5);
    expect(row('detail_dimension_rounding').default).toBe(1 / 16);
    expect(row('ipad_input').default).toBe('finger');
    expect(row('wall_stud').default).toBe('2x4');
    expect(row('wall_drywall_each_side').default).toBe(0.5);
    expect(row('wall_thickness').default).toBe(4.5);
    expect(row('wall_height').default).toBe(96);
    expect(row('overhang_standard').default).toBe(1.5);
    expect(row('overhang_seating_counter').default).toBe(12);
    expect(row('overhang_seating_bar').default).toBe(10);
    expect(row('walk_eye_height').default).toBe(66);
    expect(row('device_height_notes').default).toBe(false);
    expect(row('recently_added_window').default).toBe(30);
    expect(row('version_cleanup_age').default).toBe(30);
    expect(row('version_cleanup_grace').default).toBe(7);
    expect(row('edit_lock_auto_release').default).toBe(5);
    expect(row('share_link_expiry').default).toBe(30);
    expect(row('share_link_reminder_lead').default).toBe(7);
    expect(row('webhook_retries').default).toBe(5);
    expect(row('field_measure_range').default).toEqual({ min: 0, max: 2400 });
    for (const k of [
      'measurement_tolerance',
      'high_confidence_cutoff',
      'cabinet_fit_tolerance',
      'reference_change_tolerance',
      'leader_snap_tolerance',
      'seating_support_limit',
      'fan_blade_clearance',
      'load_warning_threshold',
      'voltage_drop_warning',
      'waste_tile',
      'pattern_straight',
    ]) {
      expect(row(k).default, k).toBeNull();
    }
  });

  it('flags the per-project keys: six waste factors, four overhangs, cabinet auto-fill and countertop increments', () => {
    expect([...PER_PROJECT_KEYS].sort()).toEqual(
      [
        'waste_tile',
        'waste_lvp',
        'waste_drywall',
        'waste_paint',
        'waste_trim',
        'waste_countertop',
        'overhang_standard',
        'overhang_seating_counter',
        'overhang_seating_bar',
        'overhang_against_wall',
        'cabinet_autofill_increment',
        'countertop_increment',
      ].sort(),
    );
  });
});

describe('EZD-116 effective value (AC-EZD-116-1; 09o Effective value)', () => {
  it('row 1: none stored, default 3" shows 3"', () => {
    expect(effectiveValue('cabinet_autofill_increment', {})).toBe(3);
  });
  it('row 2: 4" stored, default 3" shows 4"', () => {
    expect(effectiveValue('cabinet_autofill_increment', { cabinet_autofill_increment: 4 })).toBe(4);
  });
  it('row 3: none stored, no default reads Not set (null)', () => {
    expect(effectiveValue('seating_support_limit', {})).toBeNull();
    expect(effectiveDefaults({}).seating_support_limit).toBeNull();
  });
  it('a project copy wins for a per-project key only', () => {
    const eff = effectiveDefaults(
      { waste_tile: 12, pattern_straight: 3 },
      { waste_tile: 10, pattern_straight: 9 },
    );
    expect(eff.waste_tile).toBe(10);
    expect(eff.pattern_straight).toBe(3);
  });
});

describe('EZD-116 value checks (AC-EZD-116-4; 09o Value checks)', () => {
  it('lengths: 12\'6", 12\' 6 1/2", 150" and 12.5\' accepted; 12.5\' saved as 150"; "12 6" refused with the formats message', () => {
    expect(parse('measurement_tolerance', `12'6"`)).toEqual({ ok: true, value: 150 });
    expect(parse('measurement_tolerance', `12' 6 1/2"`)).toEqual({ ok: true, value: 150.5 });
    expect(parse('measurement_tolerance', `150"`)).toEqual({ ok: true, value: 150 });
    expect(parse('measurement_tolerance', `12.5'`)).toEqual({ ok: true, value: 150 });
    expect(parse('measurement_tolerance', '12 6')).toEqual({
      ok: false,
      messageKey: 'office.length.refused',
    });
  });

  it('percent −1, 0, 100, 100.5: refused, saved, saved, refused', () => {
    expect(parse('waste_tile', '-1').ok).toBe(false);
    expect(parse('waste_tile', '0')).toEqual({ ok: true, value: 0 });
    expect(parse('waste_tile', '100')).toEqual({ ok: true, value: 100 });
    expect(parse('waste_tile', '100.5')).toEqual({
      ok: false,
      messageKey: 'office.defaults.error.percent',
    });
  });

  it('minutes 0, 1, 1,440, 1,441, 2.5: refused, saved, saved, refused, refused', () => {
    expect(parse('edit_lock_auto_release', '0').ok).toBe(false);
    expect(parse('edit_lock_auto_release', '1')).toEqual({ ok: true, value: 1 });
    expect(parse('edit_lock_auto_release', '1,440')).toEqual({ ok: true, value: 1440 });
    expect(parse('edit_lock_auto_release', '1441').ok).toBe(false);
    expect(parse('edit_lock_auto_release', '2.5')).toEqual({
      ok: false,
      messageKey: 'office.defaults.error.minutes',
    });
  });

  it('days 1 to 365; 0 only for the version cleanup age and grace', () => {
    expect(parse('share_link_expiry', '0').ok).toBe(false);
    expect(parse('share_link_expiry', '1')).toEqual({ ok: true, value: 1 });
    expect(parse('share_link_expiry', '365')).toEqual({ ok: true, value: 365 });
    expect(parse('share_link_expiry', '366')).toEqual({
      ok: false,
      messageKey: 'office.defaults.error.days',
    });
    expect(parse('recently_added_window', '0').ok).toBe(false);
    expect(parse('version_cleanup_age', '0')).toEqual({ ok: true, value: 0 });
    expect(parse('version_cleanup_grace', '0')).toEqual({ ok: true, value: 0 });
    expect(parse('version_cleanup_age', '366').ok).toBe(false);
  });

  it('seating limit 1 1/2" over a standard 1 1/2" is refused; 12" is saved; empty is allowed (09o rows 4-6)', () => {
    expect(crossCheck(effectiveDefaults({ seating_support_limit: 1.5 }))).toEqual({
      seating_support_limit: 'office.defaults.error.seating_limit',
    });
    expect(crossCheck(effectiveDefaults({ seating_support_limit: 12 }))).toEqual({});
    expect(crossCheck(effectiveDefaults({}))).toEqual({});
  });

  it('share-link reminder lead must be below the expiry', () => {
    expect(crossCheck(effectiveDefaults({ share_link_reminder_lead: 30 }))).toEqual({
      share_link_reminder_lead: 'office.defaults.error.reminder_lead',
    });
    expect(
      crossCheck(effectiveDefaults({ share_link_expiry: 10, share_link_reminder_lead: 12 })),
    ).toEqual({ share_link_reminder_lead: 'office.defaults.error.reminder_lead' });
    expect(crossCheck(effectiveDefaults({ share_link_reminder_lead: 29 }))).toEqual({});
  });

  it('empty text removes the key (null); stored values of the wrong type read as unset', () => {
    expect(parse('waste_tile', '')).toEqual({ ok: true, value: null });
    expect(checkValue(row('waste_tile'), '10')).toEqual({
      ok: false,
      messageKey: 'office.defaults.error.percent',
    });
    expect(effectiveValue('cabinet_autofill_increment', { cabinet_autofill_increment: 'x' })).toBe(3);
  });
});

describe('EZD-116 copy at creation (AC-EZD-116-7; 09o Copy at creation)', () => {
  it('copies the per-project keys with a value; pattern adjustment and unset keys are left out', () => {
    expect(projectDefaultsCopy({ waste_tile: 10, pattern_straight: 5 })).toEqual({
      waste_tile: 10,
      overhang_standard: 1.5,
      overhang_seating_counter: 12,
      overhang_seating_bar: 10,
      overhang_against_wall: 0,
      cabinet_autofill_increment: 3,
      countertop_increment: 0.5,
    });
  });
});

// EZD-415 (phase-04 EZD-415 "seat width and bracket spacing are Defaults → Countertops values"; assumption EZD-415):
// two Countertops lengths, owner-entered (no default), not per project, never 0 (they divide a side's length).
describe('EZD-415 bracket spacing and seat width', () => {
  it('are Countertops lengths after the support limit, Not set by default and not copied per project', () => {
    const keys = DEFAULTS_REGISTRY.filter((r) => r.group === 'countertops').map((r) => r.key);
    expect(keys.slice(keys.indexOf('seating_support_limit'))).toEqual([
      'seating_support_limit',
      'countertop_bracket_spacing',
      'countertop_seat_width',
    ]);
    for (const k of ['countertop_bracket_spacing', 'countertop_seat_width']) {
      expect(defaultRow(k)).toMatchObject({ type: 'length', unit: 'in', default: null, perProject: false });
      expect(effectiveValue(k, {}), k).toBeNull();
      expect(effectiveValue(k, { [k]: 24 }), k).toBe(24);
      expect(checkValue(defaultRow(k)!, 24).ok, k).toBe(true);
      expect(checkValue(defaultRow(k)!, 23.5625).ok, k).toBe(true);
      expect(checkValue(defaultRow(k)!, 0).ok, k).toBe(false);
      expect(checkValue(defaultRow(k)!, -1).ok, k).toBe(false);
      expect(STORABLE_KEYS, k).toContain(k);
      expect(PER_PROJECT_KEYS, k).not.toContain(k);
    }
    // The support limit itself may still be any length the cross check allows.
    expect(checkValue(defaultRow('seating_support_limit')!, 10).ok).toBe(true);
  });
});

// EZD-228 (09d:34 "The bath clearance values that Round 3 put in Defaults now start at these code minimums"; B-07 to
// B-09): the Bath clearances row's default is the code minimums; the tub front clearance has no code value, so none.
describe('EZD-228 Bath clearances default', () => {
  it('starts at the code minimums and is read as the effective value', () => {
    const minimums = {
      side: 15,
      centerToCenter: 30,
      front: 21,
      showerFront: 24,
      showerAccess: 22,
      showerArea: 900,
      showerLeast: 30,
    };
    expect(defaultRow('bath_clearances')?.default).toEqual(minimums);
    expect(effectiveDefaults({}).bath_clearances).toEqual(minimums);
  });

  it('is still not stored (the Q-0710 editor waits for Josh)', () => {
    expect(STORABLE_KEYS).not.toContain('bath_clearances');
  });
});

// EZD-509 (S05 Decision 6; Q-0710; Q-0762; vault/build/assumptions/EZD-509.md "Where CU and LLF are kept", "Light target
// row"): CU and LLF are owner-entered Ceilings values above 0 and at most 1; the light target per room type is stored,
// one foot-candle value above 0 per room type, empty until the owner enters it. None is copied per project.
describe('EZD-509 CU, LLF and the light target per room type', () => {
  it('are Ceilings rows after the fan clearance, Not set by default, stored and not per project', () => {
    const keys = DEFAULTS_REGISTRY.filter((r) => r.group === 'ceilings').map((r) => r.key);
    expect(keys).toEqual(['act_min_border', 'fan_blade_clearance', 'light_targets', 'light_cu', 'light_llf']);
    for (const k of ['light_targets', 'light_cu', 'light_llf']) {
      expect(effectiveValue(k, {}), k).toBeNull();
      expect(STORABLE_KEYS, k).toContain(k);
      expect(PER_PROJECT_KEYS, k).not.toContain(k);
    }
    // Q-0762: a field per room type (EZD-620 adds the five new types to ROOM_TYPES).
    expect(row('light_targets').fields).toEqual(ROOM_TYPES);
  });

  it('CU and LLF take a number above 0 and at most 1', () => {
    for (const k of ['light_cu', 'light_llf']) {
      expect(checkValue(row(k), 0.6).ok, k).toBe(true);
      expect(checkValue(row(k), 1).ok, k).toBe(true);
      expect(checkValue(row(k), 0).ok, k).toBe(false);
      expect(checkValue(row(k), 1.2).ok, k).toBe(false);
      expect(checkValue(row(k), '0.6').ok, k).toBe(false);
      expect(effectiveValue(k, { [k]: 0.8 }), k).toBe(0.8);
      expect(effectiveValue(k, { [k]: 2 }), k).toBeNull();
    }
    expect(parse('light_cu', '0.6')).toEqual({ ok: true, value: 0.6 });
    expect(parse('light_llf', '.8')).toEqual({ ok: true, value: 0.8 });
    expect(parse('light_cu', '')).toEqual({ ok: true, value: null });
    expect(parse('light_cu', '1.5')).toEqual({ ok: false, messageKey: 'office.defaults.error.factor' });
    expect(parse('light_cu', 'abc')).toEqual({ ok: false, messageKey: 'office.defaults.error.factor' });
  });

  it('the light targets take only room types, each above 0', () => {
    const r = row('light_targets');
    expect(checkValue(r, { kitchen: 50, other: 30 }).ok).toBe(true);
    expect(checkValue(r, { kitchen: 0 }).ok).toBe(false);
    expect(checkValue(r, { patio: 20 }).ok).toBe(false);
    expect(checkValue(r, { kitchen: '50' }).ok).toBe(false);
    expect(checkValue(r, 30).ok).toBe(false);
    expect(effectiveValue('light_targets', { light_targets: { bath: 40 } })).toEqual({ bath: 40 });
    expect(effectiveValue('light_targets', { light_targets: { bath: -1 } })).toBeNull();
    // The popover: one text per room type; empty fields are left out; none set is null (the key is removed).
    expect(formValueOf(r, { bath: 40 })).toEqual(
      Object.fromEntries(ROOM_TYPES.map((k) => [k, k === 'bath' ? '40' : ''])),
    );
    expect(parseFormValue(r, { kitchen: '50', bath: '', laundry: ' ', other: '30' })).toEqual({
      ok: true,
      value: { kitchen: 50, other: 30 },
    });
    expect(parseFormValue(r, { kitchen: '', bath: '', laundry: '', other: '' })).toEqual({ ok: true, value: null });
    expect(parseFormValue(r, { kitchen: 'x' })).toEqual({ ok: false, messageKey: 'office.defaults.error.above_zero' });
    expect(parseFormValue(r, { kitchen: '0' })).toEqual({ ok: false, messageKey: 'office.defaults.error.above_zero' });
  });

  it('Bath clearances (no fields named yet) is still not stored', () => {
    expect(row('bath_clearances').fields).toBeUndefined();
    expect(STORABLE_KEYS).not.toContain('bath_clearances');
  });
});

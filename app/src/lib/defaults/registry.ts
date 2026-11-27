// EZD-116 (S15d Controls; board S15dDefaults; Q-0697 decisions 03 "Defaults data" and 05 "Settings → Defaults";
// Q-0558; Q-0664; Q-0706; Q-0392; Q-0207; glossary 00i "Defaults registry"): the one typed list of company
// defaults. Browser and server. Every S15d row, plus the Walls group after Increments, the Snap increment under Increments and the two version
// cleanup keys. A row whose source says "Owner enters" has no registry default (reads "Not set"); mockup
// numbers are sample data, never defaults. Answers to open questions are in vault/build/assumptions.md
// (EZD-116). Lengths are stored in inches; percents, minutes, days and counts as numbers.
import { BATH_CLEARANCE_CODE_MINIMUMS } from '@ezdraft/geometry/checks';
import { ROOM_TYPES } from '@ezdraft/geometry/schema';
import type { MessageKey } from '../../server/messages/catalog';
import {
  DEVICE_CACHE_BUDGET_DEFAULT_MB,
  DEVICE_CACHE_BUDGET_KEY,
  DEVICE_CACHE_BUDGET_MAX_MB,
  DEVICE_CACHE_BUDGET_MIN_MB,
} from '../pwa/sw-constants.mjs';

export const DEFAULT_GROUPS = [
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
  // EZD-222: S15d's last group, a table under the three columns (not in DEFAULT_COLUMNS).
  'keyboard_shortcuts',
] as const;
export type DefaultGroup = (typeof DEFAULT_GROUPS)[number];

// The board's three columns (S15dDefaults), groups top to bottom; Walls sits after Increments (Q-0697 05).
export const DEFAULT_COLUMNS: readonly (readonly DefaultGroup[])[] = [
  ['units', 'increments', 'walls', 'tolerances', 'three_d'],
  ['countertops', 'ceilings', 'electrical', 'baths', 'details'],
  ['waste', 'catalog', 'history', 'client', 'integrations'],
];

export type DefaultType =
  | 'fixed' // shown, never stored (Units display, fixed in v1)
  | 'length' // inches, Q-0561 input
  | 'length_choice' // a length from a fixed list (rounding, snap increment)
  | 'length_range' // { min, max } inches
  | 'percent' // 0 to 100
  | 'minutes' // whole 1 to 1,440
  | 'days' // whole 1 to 365 (0 allowed where zeroAllowed)
  | 'count' // whole, between min and max
  | 'choice' // one of choices
  | 'switch' // on or off
  | 'scales' // a set of the detail scales
  | 'shortcuts' // EZD-222: the key map changes, { <command>: <key> } (lib/defaults/shortcuts.ts)
  | 'factor' // EZD-509: a number above 0 and at most 1 (the lumen method's CU and LLF)
  | 'values'; // a set of named values edited in a popover (Q-0710); stored only once its fields are named

export type LengthRange = { min: number; max: number };
export type ShortcutMap = Readonly<Record<string, string>>;
// EZD-228: a 'values' row's named numbers (Bath clearances: inches, the shower area in square inches).
export type NamedValues = Readonly<Record<string, number>>;
export type DefaultValue =
  number | string | boolean | readonly string[] | LengthRange | ShortcutMap | NamedValues;

export type DefaultRow = {
  key: string;
  group: DefaultGroup;
  label: MessageKey;
  hint?: MessageKey;
  type: DefaultType;
  unit?: 'in' | '%' | 'min' | 'days' | 'MB';
  default: DefaultValue | null;
  // Copied into project.settings.defaults when a project is made (S15d Decision 4; Q-0697 03).
  perProject: boolean;
  choices?: readonly string[];
  lengths?: readonly number[];
  zeroAllowed?: boolean;
  min?: number;
  max?: number;
  // EZD-134: the refusal message when the type's shared one names other bounds.
  refusal?: MessageKey;
  // EZD-415: a length that cannot be 0 outside the always-positive groups (values.ts lengthKind).
  positive?: boolean;
  // EZD-509 (Q-0710): a 'values' row's named fields, each a number above 0; a 'values' row without them is not stored.
  fields?: readonly string[];
};

// Q-0207: dimension rounding choices (assumption Q-0713 (a)).
export const ROUNDING_CHOICES_IN = [0.0625, 0.125, 0.25, 0.5, 1] as const;
// Q-0664: the snap increments.
export const SNAP_CHOICES_IN = [0.0625, 0.125, 0.25, 0.5, 1, 6, 12] as const;
// S15d Details row: the seven detail scales.
export const DETAIL_SCALES = ['3/4', '1', '1 1/2', '3', '6', 'full', 'nts'] as const;
// EZD-1611a: the drywall sheet sizes and the SF of each (09i Drywall "Sheet 4 x 8 (32 SF)").
export const DRYWALL_SHEETS = ['4x8', '4x10', '4x12'] as const;
export const DRYWALL_SHEET_SQ_FT: Readonly<Record<string, number>> = {
  '4x8': 32,
  '4x10': 40,
  '4x12': 48,
};
// Q-0570 / S15d: the field measure sanity range tops out at 200 ft (assumption Q-0715 (a)).
export const FIELD_RANGE_MAX_IN = 2400;

const row = (r: Omit<DefaultRow, 'perProject'> & { perProject?: boolean }): DefaultRow => ({
  perProject: false,
  ...r,
});

const L = (k: string) => `office.defaults.row.${k}` as MessageKey;
const H = (k: string) => `office.defaults.hint.${k}` as MessageKey;

export const DEFAULTS_REGISTRY: readonly DefaultRow[] = [
  // Units
  row({
    key: 'units_display',
    group: 'units',
    label: L('units_display'),
    type: 'fixed',
    default: null,
  }),
  row({
    key: 'plan_dimension_rounding',
    group: 'units',
    label: L('plan_dimension_rounding'),
    type: 'length_choice',
    unit: 'in',
    lengths: ROUNDING_CHOICES_IN,
    default: 0.5,
  }),
  row({
    key: 'detail_dimension_rounding',
    group: 'units',
    label: L('detail_dimension_rounding'),
    type: 'length_choice',
    unit: 'in',
    lengths: ROUNDING_CHOICES_IN,
    default: 0.0625,
  }),
  row({
    key: 'ipad_input',
    group: 'units',
    label: L('ipad_input'),
    hint: H('ipad_input'),
    type: 'choice',
    choices: ['pencil', 'finger'],
    default: 'finger',
  }),
  // Increments
  row({
    key: 'cabinet_autofill_increment',
    group: 'increments',
    label: L('cabinet_autofill_increment'),
    type: 'length',
    unit: 'in',
    default: 3,
    perProject: true,
  }),
  row({
    key: 'countertop_increment',
    group: 'increments',
    label: L('countertop_increment'),
    type: 'length',
    unit: 'in',
    default: 0.5,
    perProject: true,
  }),
  row({
    key: 'snap_increment',
    group: 'increments',
    label: L('snap_increment'),
    type: 'length_choice',
    unit: 'in',
    lengths: SNAP_CHOICES_IN,
    default: 0.5,
  }),
  // Walls (Q-0558)
  row({
    key: 'wall_thickness',
    group: 'walls',
    label: L('wall_thickness'),
    type: 'length',
    unit: 'in',
    default: 4.5,
  }),
  row({
    key: 'wall_stud',
    group: 'walls',
    label: L('wall_stud'),
    type: 'choice',
    choices: ['2x4', '2x6'],
    default: '2x4',
  }),
  row({
    key: 'wall_drywall_each_side',
    group: 'walls',
    label: L('wall_drywall_each_side'),
    type: 'length',
    unit: 'in',
    default: 0.5,
  }),
  row({
    key: 'wall_height',
    group: 'walls',
    label: L('wall_height'),
    type: 'length',
    unit: 'in',
    default: 96,
  }),
  row({
    key: 'wall_exterior_block',
    group: 'walls',
    label: L('wall_exterior_block'),
    hint: H('wall_exterior_block'),
    type: 'length',
    unit: 'in',
    default: null,
  }),
  // Tolerances
  row({
    key: 'measurement_tolerance',
    group: 'tolerances',
    label: L('measurement_tolerance'),
    hint: H('measurement_tolerance'),
    type: 'length',
    unit: 'in',
    default: null,
  }),
  row({
    key: 'high_confidence_cutoff',
    group: 'tolerances',
    label: L('high_confidence_cutoff'),
    hint: H('high_confidence_cutoff'),
    type: 'percent',
    unit: '%',
    default: null,
  }),
  row({
    key: 'cabinet_fit_tolerance',
    group: 'tolerances',
    label: L('cabinet_fit_tolerance'),
    hint: H('cabinet_fit_tolerance'),
    type: 'length',
    unit: 'in',
    default: null,
  }),
  row({
    key: 'reference_change_tolerance',
    group: 'tolerances',
    label: L('reference_change_tolerance'),
    hint: H('reference_change_tolerance'),
    type: 'length',
    unit: 'in',
    default: null,
  }),
  row({
    key: 'leader_snap_tolerance',
    group: 'tolerances',
    label: L('leader_snap_tolerance'),
    hint: H('leader_snap_tolerance'),
    type: 'length',
    unit: 'in',
    default: null,
  }),
  row({
    key: 'field_measure_range',
    group: 'tolerances',
    label: L('field_measure_range'),
    hint: H('field_measure_range'),
    type: 'length_range',
    unit: 'in',
    default: { min: 0, max: FIELD_RANGE_MAX_IN },
  }),
  // 3D
  row({
    key: 'walk_eye_height',
    group: 'three_d',
    label: L('walk_eye_height'),
    type: 'length',
    unit: 'in',
    default: 66,
  }),
  // Countertops
  row({
    key: 'overhang_standard',
    group: 'countertops',
    label: L('overhang_standard'),
    type: 'length',
    unit: 'in',
    default: 1.5,
    perProject: true,
  }),
  row({
    key: 'overhang_seating_counter',
    group: 'countertops',
    label: L('overhang_seating_counter'),
    type: 'length',
    unit: 'in',
    default: 12,
    perProject: true,
  }),
  row({
    key: 'overhang_seating_bar',
    group: 'countertops',
    label: L('overhang_seating_bar'),
    type: 'length',
    unit: 'in',
    default: 10,
    perProject: true,
  }),
  row({
    key: 'overhang_against_wall',
    group: 'countertops',
    label: L('overhang_against_wall'),
    hint: H('overhang_against_wall'),
    type: 'length',
    unit: 'in',
    default: 0,
    perProject: true,
  }),
  row({
    key: 'seating_support_limit',
    group: 'countertops',
    label: L('seating_support_limit'),
    hint: H('seating_support_limit'),
    type: 'length',
    unit: 'in',
    default: null,
  }),
  // EZD-415 (phase-04 EZD-415 "seat width and bracket spacing are Defaults → Countertops values"; assumption EZD-415):
  // the support check's bracket spacing (on centre) and the Seats row's seat width. Owner enters; never 0.
  row({
    key: 'countertop_bracket_spacing',
    group: 'countertops',
    label: L('countertop_bracket_spacing'),
    hint: H('countertop_bracket_spacing'),
    type: 'length',
    unit: 'in',
    default: null,
    positive: true,
  }),
  row({
    key: 'countertop_seat_width',
    group: 'countertops',
    label: L('countertop_seat_width'),
    hint: H('countertop_seat_width'),
    type: 'length',
    unit: 'in',
    default: null,
    positive: true,
  }),
  // Ceilings
  row({
    key: 'act_min_border',
    group: 'ceilings',
    label: L('act_min_border'),
    type: 'choice',
    choices: ['1/4', '1/3', '1/2'],
    default: '1/2',
  }),
  row({
    key: 'fan_blade_clearance',
    group: 'ceilings',
    label: L('fan_blade_clearance'),
    hint: H('fan_blade_clearance'),
    type: 'length',
    unit: 'in',
    default: null,
  }),
  // EZD-509 (S05 Decision 6; Q-0710; Q-0762): the foot-candle target per room type, one field per room type, empty
  // until the owner enters it; and the lumen method's CU and LLF (assumption EZD-509), owner-entered.
  row({
    key: 'light_targets',
    group: 'ceilings',
    label: L('light_targets'),
    hint: H('light_targets'),
    type: 'values',
    default: null,
    fields: ROOM_TYPES,
  }),
  row({
    key: 'light_cu',
    group: 'ceilings',
    label: L('light_cu'),
    type: 'factor',
    default: null,
  }),
  row({
    key: 'light_llf',
    group: 'ceilings',
    label: L('light_llf'),
    type: 'factor',
    default: null,
  }),
  // Electrical
  row({
    key: 'load_warning_threshold',
    group: 'electrical',
    label: L('load_warning_threshold'),
    hint: H('load_warning_threshold'),
    type: 'percent',
    unit: '%',
    default: null,
  }),
  row({
    key: 'voltage_drop_warning',
    group: 'electrical',
    label: L('voltage_drop_warning'),
    hint: H('voltage_drop_warning'),
    type: 'percent',
    unit: '%',
    default: null,
  }),
  row({
    key: 'device_height_notes',
    group: 'electrical',
    label: L('device_height_notes'),
    hint: H('device_height_notes'),
    type: 'switch',
    default: false,
  }),
  // EZD-1611b (09i Takeoff rules "Wire | ... x (1 + slack) | Slack 15%"; vault/build/assumptions/EZD-1611b.md "Wire per
  // circuit"): the takeoff's wire slack, company only.
  row({
    key: 'wire_slack',
    group: 'electrical',
    label: L('wire_slack'),
    type: 'percent',
    unit: '%',
    default: 15,
  }),
  // Baths. EZD-228 (09d:34 "The bath clearance values that Round 3 put in Defaults now start at these code
  // minimums"; B-07 to B-09): the default is the code minimums; the tub front clearance has none (no code value).
  // The Q-0710 editor waits for Josh's values, so the row is not stored yet.
  row({
    key: 'bath_clearances',
    group: 'baths',
    label: L('bath_clearances'),
    hint: H('bath_clearances'),
    type: 'values',
    default: { ...BATH_CLEARANCE_CODE_MINIMUMS },
  }),
  // Details
  row({
    key: 'detail_scales',
    group: 'details',
    label: L('detail_scales'),
    type: 'scales',
    choices: DETAIL_SCALES,
    default: DETAIL_SCALES,
  }),
  // Waste factors (copied per project; pattern adjustment is not, Q-0697 03)
  ...(['tile', 'lvp', 'drywall', 'paint', 'trim', 'countertop'] as const).map((m) =>
    row({
      key: `waste_${m}`,
      group: 'waste',
      label: L(`waste_${m}`),
      type: 'percent',
      unit: '%',
      default: null,
      perProject: true,
    }),
  ),
  ...(['straight', 'diagonal', 'herringbone'] as const).map((p) =>
    row({
      key: `pattern_${p}`,
      group: 'waste',
      label: L(`pattern_${p}`),
      type: 'percent',
      unit: '%',
      default: null,
    }),
  ),
  // EZD-1611a (09i Takeoff rules: "Every number named here is a Defaults value the owner can change";
  // vault/build/assumptions/EZD-1611a.md "Defaults the formulas name"): the drywall sheet, paint coats and coverage and
  // the tile box coverage, with the formulas table's numbers; company only, not copied per project.
  row({
    key: 'drywall_sheet',
    group: 'waste',
    label: L('drywall_sheet'),
    type: 'choice',
    choices: DRYWALL_SHEETS,
    default: '4x8',
  }),
  row({
    key: 'paint_coats',
    group: 'waste',
    label: L('paint_coats'),
    type: 'count',
    refusal: 'office.defaults.error.paint_coats' as MessageKey,
    default: 2,
    min: 1,
    max: 5,
  }),
  row({
    key: 'paint_coverage',
    group: 'waste',
    label: L('paint_coverage'),
    type: 'count',
    refusal: 'office.defaults.error.paint_coverage' as MessageKey,
    default: 350,
    min: 100,
    max: 1000,
  }),
  row({
    key: 'tile_box_coverage',
    group: 'waste',
    label: L('tile_box_coverage'),
    type: 'count',
    refusal: 'office.defaults.error.tile_box_coverage' as MessageKey,
    default: 10,
    min: 1,
    max: 100,
  }),
  // Catalog
  row({
    key: 'recently_added_window',
    group: 'catalog',
    label: L('recently_added_window'),
    type: 'days',
    unit: 'days',
    default: 30,
  }),
  // History + collaboration (S15d row 44 is two keys, Q-0697 05; 0 allowed, Q-0706)
  row({
    key: 'version_cleanup_age',
    group: 'history',
    label: L('version_cleanup_age'),
    hint: H('version_cleanup_age'),
    type: 'days',
    unit: 'days',
    default: 30,
    zeroAllowed: true,
  }),
  row({
    key: 'version_cleanup_grace',
    group: 'history',
    label: L('version_cleanup_grace'),
    hint: H('version_cleanup_grace'),
    type: 'days',
    unit: 'days',
    default: 7,
    zeroAllowed: true,
  }),
  row({
    key: 'edit_lock_auto_release',
    group: 'history',
    label: L('edit_lock_auto_release'),
    hint: H('edit_lock_auto_release'),
    type: 'minutes',
    unit: 'min',
    default: 5,
  }),
  // EZD-134 (03b Architecture rule 10): megabytes each device keeps for cached projects other than the open one
  // (default and bounds: assumption EZD-134 in vault/build/assumptions.md; S15d has no such row).
  row({
    key: DEVICE_CACHE_BUDGET_KEY,
    group: 'history',
    label: L('device_cache_budget'),
    hint: H('device_cache_budget'),
    type: 'count',
    unit: 'MB',
    default: DEVICE_CACHE_BUDGET_DEFAULT_MB,
    min: DEVICE_CACHE_BUDGET_MIN_MB,
    max: DEVICE_CACHE_BUDGET_MAX_MB,
    refusal: 'office.defaults.error.device_cache_budget' as MessageKey,
  }),
  // Client
  row({
    key: 'share_link_expiry',
    group: 'client',
    label: L('share_link_expiry'),
    hint: H('share_link_expiry'),
    type: 'days',
    unit: 'days',
    default: 30,
  }),
  row({
    key: 'share_link_reminder_lead',
    group: 'client',
    label: L('share_link_reminder_lead'),
    type: 'days',
    unit: 'days',
    default: 7,
  }),
  // Integrations (bounds: assumption Q-0715 (a))
  row({
    key: 'webhook_retries',
    group: 'integrations',
    label: L('webhook_retries'),
    hint: H('webhook_retries'),
    type: 'count',
    default: 5,
    min: 0,
    max: 10,
  }),
  // EZD-222 (S15d Keyboard shortcuts): the owner's changes to the default key map; {} is the default map.
  row({
    key: 'keyboard_shortcuts',
    group: 'keyboard_shortcuts',
    label: L('keyboard_shortcuts'),
    type: 'shortcuts',
    default: {},
  }),
];

export type DefaultKey = string;

const BY_KEY = new Map(DEFAULTS_REGISTRY.map((r) => [r.key, r]));

export function defaultRow(key: string): DefaultRow | undefined {
  return BY_KEY.get(key);
}

// Keys that can be stored in tenant.defaults (every row except fixed and the popover rows whose fields are
// still owed). The migration holds the same list (registry-sql.test.ts).
// EZD-509: a 'values' row is stored once its fields are named (Light target per room type; Bath clearances not yet).
export const STORABLE_KEYS: readonly string[] = DEFAULTS_REGISTRY.filter(
  (r) => r.type !== 'fixed' && (r.type !== 'values' || r.fields !== undefined),
).map((r) => r.key);

export const PER_PROJECT_KEYS: readonly string[] = DEFAULTS_REGISTRY.filter(
  (r) => r.perProject,
).map((r) => r.key);

export const GROUP_LABEL: Record<DefaultGroup, MessageKey> = Object.fromEntries(
  DEFAULT_GROUPS.map((g) => [g, `office.defaults.group.${g}` as MessageKey]),
) as Record<DefaultGroup, MessageKey>;

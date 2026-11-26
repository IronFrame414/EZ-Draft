// EZD-612 (phase-06 EZD-612 row "runs every registered rule set (... fan clearance and keep-clear EZD-514 and EZD-515,
// orphan flags)"; AC-EZD-612-2; assumptions EZD-611a "Rules that are not in the catalog"): the ceiling checks of
// EZD-514 and EZD-515 as company rules, so Check lists them beside the bath clearance rules. The tests are the
// geometry's own (fanClearanceWarnings, keepClearWarning, isOffCeiling); these rules only report them.
// - FC-001 fan blade clearance: reads the Defaults `fan_blade_clearance`; Not set is cannot-check (AC-EZD-611a-2).
// - KC-001 keep-clear: a can over a known joist or beam.
// - HC-001 hosted ceiling item off any ceiling (S05 Validation, the orphan flag).
import {
  fanClearanceWarnings,
  isOffCeiling,
  keepClearWarning,
  type CodeRule,
  type RuleSet,
} from '@ezdraft/geometry';

// Where the engine's project values hold the Defaults fan blade clearance (inches).
export const FAN_CLEARANCE_PROJECT_KEY = 'fanBladeClearance';
// The value FC-001 names when it cannot check (shown as "{need} not set in Defaults").
export const FAN_CLEARANCE_NEED = 'Fan blade clearance';

export const CEILING_RULE_IDS = {
  fanClearance: 'FC-001',
  keepClear: 'KC-001',
  offCeiling: 'HC-001',
} as const;

const BASE = {
  code: 'company',
  type: 'automatic',
  trigger: 'new_work',
  sections: {},
  url: null,
} as const;

function fanClearance(project: Readonly<Record<string, unknown>>): number | null {
  const v = project[FAN_CLEARANCE_PROJECT_KEY];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

const r = (n: number) => Math.round(n * 16) / 16;

export const CEILING_RULES: readonly CodeRule[] = [
  {
    ...BASE,
    id: CEILING_RULE_IDS.fanClearance,
    appliesTo: ['device'],
    when: (o) => o.type === 'device' && o.data.attributes.kind === 'ceiling_fan',
    test: (o, ctx) => {
      const clearance = fanClearance(ctx.project);
      if (clearance === null) return { status: 'missing', need: FAN_CLEARANCE_NEED };
      const warnings = fanClearanceWarnings(o, ctx.model.objects, clearance);
      if (warnings.length === 0) return { status: 'pass' };
      // The closest of the wall and beam warnings is the one reported.
      const w = warnings.reduce((a, b) => (b.gap < a.gap ? b : a));
      return {
        status: 'fail',
        values: {
          fixture: 'ceiling_fan',
          against: w.against,
          measured: r(w.gap),
          required: clearance,
        },
      };
    },
  },
  {
    ...BASE,
    id: CEILING_RULE_IDS.keepClear,
    appliesTo: ['device'],
    when: (o) => o.type === 'device' && o.data.attributes.kind === 'recessed_light',
    test: (o, ctx) => {
      const w = keepClearWarning(o, ctx.model.objects);
      return w === null ? { status: 'pass' } : { status: 'fail', values: { member: w.kind } };
    },
  },
  {
    ...BASE,
    id: CEILING_RULE_IDS.offCeiling,
    appliesTo: ['device', 'access', 'hvac'],
    test: (o, ctx) =>
      isOffCeiling(o, ctx.model.objects) ? { status: 'fail' } : { status: 'pass' },
  },
];

/** The ceiling rule set for each edition given (company rules run whatever the edition). */
export function ceilingRuleSets(editions: readonly string[]): RuleSet[] {
  return editions.map((edition) => ({ code: 'company', edition, rules: CEILING_RULES }));
}

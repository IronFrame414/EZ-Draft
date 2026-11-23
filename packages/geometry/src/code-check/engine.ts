// EZD-611a (09c Code check engine; R26 R19, R34; AC-EZD-611a-1..4): the code check engine and its rule registry.
// The registry holds rule sets, one per code volume and edition, so a new code or edition is added as data plus
// check functions without touching the engine. A check only reports: it never changes the model ("warnings only,
// never auto-fix"). Results carry ids and values; the words shown are the app's (EZD-612 renders them).
//
// - A rule runs only on a project of its rule set's edition (AC-1), and only on the objects it applies to: a bath
//   rule needs a bathroom, a stair rule a stair. No such object means no result.
// - A rule whose value is missing returns "cannot check" naming the value, never a pass (AC-2).
// - Until a licensed person marks a rule verified, its results carry the not-yet-verified tag (AC-3; R19).
// - Alterations: new work and rooms that contain new or demolished objects give warnings; existing conditions that
//   are not altered give notes (AC-4). A whole-dwelling rule (smoke alarms) gives warnings across the dwelling once
//   anything is altered. Scope rules: ./scope.ts.
import type { ModelDocument, ModelObject, ObjectType } from '../schema';
import { alterationScope } from './scope';

// The catalog's three types (R34): checked from the drawing, checked once the user enters the value the rule names,
// or a checklist item shown when the triggering object exists.
export const RULE_TYPES = ['automatic', 'needs_data', 'reminder'] as const;
export type RuleType = (typeof RULE_TYPES)[number];

// The catalog's trigger column (new-work, whole-dwelling, ...), lower snake case as stored: when a remodel triggers it.
export const RULE_TRIGGERS = ['new_work', 'whole_dwelling', 'change_of_use', 'new_dwellings_only'] as const;
export type RuleTrigger = (typeof RULE_TRIGGERS)[number];

export type CheckSeverity = 'warning' | 'note';

// What a rule's test answers for one object. `missing` names the value the rule needs (for example "ceiling
// height"); EZD-612 shows it as "Ceiling height not set in Bath 2".
export type RuleOutcome =
  | { status: 'pass' }
  | { status: 'fail'; values?: Readonly<Record<string, string | number | boolean>> }
  | { status: 'missing'; need: string };

export type RuleContext = {
  model: ModelDocument;
  edition: string;
  // Project values the rules need (EZD-620 adds them: county, flood zone, year built and the rest).
  project: Readonly<Record<string, unknown>>;
};

export type CodeRule = {
  // The catalog rule id (code_rule.rule_id), for example "R3-017".
  id: string;
  // The code volume, as the catalog names it: NEC, FBC-R, FBC-EB, FBC-EC, FBC-B, or company.
  code: string;
  type: RuleType;
  trigger: RuleTrigger;
  // The section number per edition key (for example { fbc9_nec2023: 'R302.5.1' }).
  sections: Readonly<Record<string, string>>;
  // The section in the publisher's free online viewer.
  url: string | null;
  // The object types the rule applies to.
  appliesTo: readonly ObjectType[];
  // Narrows the objects further (a bath rule: a room whose type is bath). Default: every object of those types.
  when?: (object: ModelObject, ctx: RuleContext) => boolean;
  // The test of an Automatic or Needs data rule. A Reminder has none: it appears when its trigger object exists.
  test?: (object: ModelObject, ctx: RuleContext) => RuleOutcome;
};

export type RuleSet = { code: string; edition: string; rules: readonly CodeRule[] };

export type CheckResultStatus = 'fail' | 'cannot_check' | 'reminder';

export type CheckResult = {
  ruleId: string;
  code: string;
  edition: string;
  // The rule's section in the project's edition; null when the rule has none for it yet (EZD-1710 tests that).
  section: string | null;
  url: string | null;
  type: RuleType;
  status: CheckResultStatus;
  severity: CheckSeverity;
  objectId: string;
  objectType: ObjectType;
  // cannot_check: the value the rule needs.
  need?: string;
  // fail: the values the rule's test reports.
  values?: Readonly<Record<string, string | number | boolean>>;
  // The not-yet-verified tag (R19): on until a licensed person marks the rule verified.
  unverified: boolean;
};

export class RuleRegistryError extends Error {}

export type RuleRegistry = {
  register: (set: RuleSet) => void;
  // The rule sets of one edition, in the order registered.
  ruleSets: (edition: string) => RuleSet[];
  // Every rule id registered for one edition.
  ruleIds: (edition: string) => string[];
};

export function createRuleRegistry(sets: readonly RuleSet[] = []): RuleRegistry {
  const all: RuleSet[] = [];
  const register = (set: RuleSet) => {
    const taken = new Set(all.filter((s) => s.edition === set.edition).flatMap((s) => s.rules.map((r) => r.id)));
    for (const rule of set.rules) {
      if (taken.has(rule.id)) {
        throw new RuleRegistryError(`rule ${rule.id} is registered twice for ${set.edition}`);
      }
      taken.add(rule.id);
      if (rule.type !== 'reminder' && rule.test === undefined) {
        throw new RuleRegistryError(`rule ${rule.id} is ${rule.type} and has no test`);
      }
      if (rule.code !== set.code) {
        throw new RuleRegistryError(`rule ${rule.id} is ${rule.code}, not ${set.code}`);
      }
    }
    all.push(set);
  };
  for (const s of sets) register(s);
  return {
    register,
    ruleSets: (edition) => all.filter((s) => s.edition === edition),
    ruleIds: (edition) => all.filter((s) => s.edition === edition).flatMap((s) => s.rules.map((r) => r.id)),
  };
}

export type RunCodeCheckInput = {
  model: ModelDocument;
  // The project's effective edition (app/src/lib/code-edition/editions.ts projectEdition).
  edition: string;
  registry: RuleRegistry;
  // Rule ids a licensed person has marked verified (code_rule.verified_at set).
  verifiedRuleIds: ReadonlySet<string>;
  project?: Readonly<Record<string, unknown>>;
};

export function runCodeCheck(input: RunCodeCheckInput): CheckResult[] {
  const { model, edition, registry, verifiedRuleIds } = input;
  const ctx: RuleContext = { model, edition, project: input.project ?? {} };
  const scope = alterationScope(model);
  const results: CheckResult[] = [];

  for (const set of registry.ruleSets(edition)) {
    for (const rule of set.rules) {
      for (const object of model.objects) {
        if (!rule.appliesTo.includes(object.type)) continue;
        // A demolished object is going away: it alters its room but is not itself checked (assumptions EZD-611a).
        if (scope.isDemolished(object)) continue;
        if (rule.when && !rule.when(object, ctx)) continue;

        let status: CheckResultStatus;
        let need: string | undefined;
        let values: CheckResult['values'];
        if (rule.type === 'reminder') {
          status = 'reminder';
        } else {
          const outcome = (rule.test as NonNullable<CodeRule['test']>)(object, ctx);
          if (outcome.status === 'pass') continue;
          if (outcome.status === 'missing') {
            status = 'cannot_check';
            need = outcome.need;
          } else {
            status = 'fail';
            values = outcome.values;
          }
        }

        const inScope = rule.trigger === 'whole_dwelling' ? scope.anyAltered : scope.isAltered(object);
        const result: CheckResult = {
          ruleId: rule.id,
          code: rule.code,
          edition,
          section: rule.sections[edition] ?? null,
          url: rule.url,
          type: rule.type,
          status,
          severity: inScope ? 'warning' : 'note',
          objectId: object.id,
          objectType: object.type,
          unverified: !verifiedRuleIds.has(rule.id),
        };
        if (need !== undefined) result.need = need;
        if (values !== undefined) result.values = values;
        results.push(result);
      }
    }
  }
  return results;
}

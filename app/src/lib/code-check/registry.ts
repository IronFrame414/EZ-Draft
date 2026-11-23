// EZD-611a (09c Code check engine; R26 R34): the app's rule sets. Each code rule ticket (EZD-611b to EZD-639) adds its
// rule set for its code and edition to CODE_RULE_SETS; the engine itself (packages/geometry/src/code-check) never
// changes for a new code or edition. Browser and server.
import { createRuleRegistry, type RuleRegistry, type RuleSet } from '@ezdraft/geometry';

export const CODE_RULE_SETS: readonly RuleSet[] = [];

export function appRuleRegistry(sets: readonly RuleSet[] = CODE_RULE_SETS): RuleRegistry {
  return createRuleRegistry(sets);
}

// The rule ids a licensed person has marked verified, from code_rule rows (R19: verified_at set).
export function verifiedRuleIdsOf(rows: readonly { rule_id: string; verified_at: string | null }[]): Set<string> {
  return new Set(rows.filter((r) => r.verified_at !== null).map((r) => r.rule_id));
}

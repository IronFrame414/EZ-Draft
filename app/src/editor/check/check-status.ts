// EZD-612 (phase-06 EZD-612 row "results are grouped as Warnings, Needs a value and Checklist"; S06 Check status pill
// "Green when no open warnings; amber with count when warnings exist; grey 'Check not run' after changes since the
// last check"; AC-EZD-612-3 "accepting a warning with a note removes it from the open count"): the pure side of the
// results list and the pill. Browser only; the server keeps its own count (check-run.ts openWarningCount).
import type { CheckResult } from '@ezdraft/geometry';

export type AcceptedWarning = {
  ruleId: string;
  objectId: string;
  edition: string;
  note: string;
  by: string | null;
  byName: string | null;
  at: string;
  objectSeq: number | null;
};

export type CodeCheckRun = {
  runId: string;
  edition: string;
  createdAt: string;
  results: CheckResult[];
  accepted: AcceptedWarning[];
};

// Warnings: failing rules on new or altered work. Needs a value: rules that cannot run until a value is entered.
// Checklist: Reminder rules whose trigger exists. Notes: failing rules on existing work that is not altered
// (AC-EZD-611a-4), shown after the three groups and never counted.
export const CHECK_GROUPS = ['warnings', 'needs_value', 'checklist', 'notes'] as const;
export type CheckGroup = (typeof CHECK_GROUPS)[number];

export function groupOf(r: Pick<CheckResult, 'status' | 'severity'>): CheckGroup {
  if (r.status === 'cannot_check') return 'needs_value';
  if (r.status === 'reminder') return 'checklist';
  return r.severity === 'warning' ? 'warnings' : 'notes';
}

const keyOf = (r: { ruleId: string; objectId: string }) => `${r.ruleId}|${r.objectId}`;

export type CheckItem = { key: string; result: CheckResult; accepted: AcceptedWarning | null };

export function groupResults(
  run: Pick<CodeCheckRun, 'results' | 'accepted'>,
): Record<CheckGroup, CheckItem[]> {
  const accepted = new Map(run.accepted.map((a) => [keyOf(a), a]));
  const out: Record<CheckGroup, CheckItem[]> = {
    warnings: [],
    needs_value: [],
    checklist: [],
    notes: [],
  };
  const seen = new Set<string>();
  for (const result of run.results) {
    const key = keyOf(result);
    if (seen.has(key)) continue;
    seen.add(key);
    const group = groupOf(result);
    out[group].push({
      key,
      result,
      accepted: group === 'warnings' ? (accepted.get(key) ?? null) : null,
    });
  }
  return out;
}

/** The warnings still open: failing warnings not accepted with a note. */
export function openCount(run: Pick<CodeCheckRun, 'results' | 'accepted'>): number {
  return groupResults(run).warnings.filter((i) => i.accepted === null).length;
}

export type PillState =
  | { kind: 'not_run' }
  | { kind: 'pass'; at: string }
  | { kind: 'warnings'; at: string; count: number };

/** The pill: grey "Check not run" with no run or after a change since it; else green or amber with the count. */
export function pillState(run: CodeCheckRun | null, changedSinceRun: boolean): PillState {
  if (run === null || changedSinceRun) return { kind: 'not_run' };
  const count = openCount(run);
  return count === 0
    ? { kind: 'pass', at: run.createdAt }
    : { kind: 'warnings', at: run.createdAt, count };
}

/** "10:41 AM" (board S06Electrical "Last check 10:41 AM"). */
export function checkTime(iso: string, locale = 'en-US', timeZone?: string): string {
  return new Date(iso).toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  });
}

// EZD-1955 (audit 2026-11-23 O2): the reviewer fails a ticket whose acceptance criteria are not each named in a test.
// The loop runs scripts/conventions/ac-trace.mjs in the ticket's worktree and puts the result in the reviewer prompt,
// so the read-only reviewer does not have to run anything. Tickets merged before the one under review (already done)
// are reported in the verdict notes, never failed.
import { traceForTicket } from '../conventions/ac-trace.mjs';

// { missing, error, skipped? } for ticket id in worktree wt. error is set when the trace could not be read. skipped
// ([{ id, reason }], only when any): ACs marked *(field check)*, *(met by EZD-xxx)* or *(not a builder task)* (EZD-2023).
export function traceTicket(wt, id) {
  try {
    const { missing, skipped } = traceForTicket(wt, id);
    return skipped.length ? { missing, error: '', skipped } : { missing, error: '' };
  } catch (e) { return { missing: [], error: String(e?.message || e).slice(0, 200) }; }
}
// The prompt line for skipped ACs (EZD-2023, audit 2026-11-27 X2), or '' when none.
export function skippedLine(skipped = []) {
  if (!skipped.length) return '';
  return `Skipped by the AC trace, because they are marked as not a test of this ticket: ${skipped.map((k) => `${k.id} (${k.reason})`).join(', ')}. `
    + 'Do not ask for a test of them and do not fail the ticket over them: a field check is Josh\'s manual check, a row met by another ticket is checked there, and a row that is not a builder task is done by someone else.';
}

// Prompt lines for the reviewer. t: the ticket record; missing: its ACs not named in a test; alreadyDone: the ticket
// was merged before (a re-review), so its gaps are reported and not failed.
// skipped: the ticket's ACs the trace skips (traceTicket), listed as skipped and never as findings (EZD-2023).
export function acReviewLines(t, missing = [], { alreadyDone = false, error = '', skipped = [] } = {}) {
  const acs = t.acs || [];
  if (!acs.length) return [];
  const rule = 'Traceability rule (EZD-1955): every acceptance criterion id of this ticket must be named in a test title or comment (a test file under app/, packages/, scripts/ or supabase/), except rows marked *(field check)*, *(met by EZD-xxx)* or *(not a builder task)*.';
  const skip = skippedLine(skipped);
  if (error) return [rule, `The automatic AC trace could not run (${error}); check with \`node scripts/conventions/ac-trace.mjs --ticket ${t.id}\` and \`git grep\` yourself.`];
  if (!missing.length) return [rule, skipped.length ? 'The automatic AC trace (scripts/conventions/ac-trace.mjs) found every other one named in a test.' : 'The automatic AC trace (scripts/conventions/ac-trace.mjs) found every one named in a test.', skip].filter(Boolean);
  if (alreadyDone) {
    return [rule, `${t.id} was merged before this rule; the AC trace found these not named in a test: ${missing.join(', ')}. Report them in "notes" only; they are not a finding and do not fail the ticket.`, skip].filter(Boolean);
  }
  return [rule, ...(skip ? [skip] : []),
    `The automatic AC trace (scripts/conventions/ac-trace.mjs) found these acceptance criteria not named in any test: ${missing.join(', ')}.`,
    'Each one is a blocking finding (verdict "fail"): fix = name the id in the title or a comment of the test that proves it, adding that test if none does.',
    'Acceptance criteria of other tickets merged before this one that are not named in a test are not this ticket\'s problem: mention them in "notes" at most, never as a finding.'];
}

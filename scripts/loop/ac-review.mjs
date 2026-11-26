// EZD-1955 (audit 2026-11-23 O2): the reviewer fails a ticket whose acceptance criteria are not each named in a test.
// The loop runs scripts/conventions/ac-trace.mjs in the ticket's worktree and puts the result in the reviewer prompt,
// so the read-only reviewer does not have to run anything. Tickets merged before the one under review (already done)
// are reported in the verdict notes, never failed.
import { untracedForTicket } from '../conventions/ac-trace.mjs';

// { missing, error } for ticket id in worktree wt. error is set when the trace could not be read.
export function traceTicket(wt, id) {
  try { return { missing: untracedForTicket(wt, id), error: '' }; } catch (e) { return { missing: [], error: String(e?.message || e).slice(0, 200) }; }
}

// Prompt lines for the reviewer. t: the ticket record; missing: its ACs not named in a test; alreadyDone: the ticket
// was merged before (a re-review), so its gaps are reported and not failed.
export function acReviewLines(t, missing = [], { alreadyDone = false, error = '' } = {}) {
  const acs = t.acs || [];
  if (!acs.length) return [];
  const rule = 'Traceability rule (EZD-1955): every acceptance criterion id of this ticket must be named in a test title or comment (a test file under app/, packages/, scripts/ or supabase/).';
  if (error) return [rule, `The automatic AC trace could not run (${error}); check with \`node scripts/conventions/ac-trace.mjs --ticket ${t.id}\` and \`git grep\` yourself.`];
  if (!missing.length) return [rule, 'The automatic AC trace (scripts/conventions/ac-trace.mjs) found every one named in a test.'];
  if (alreadyDone) {
    return [rule, `${t.id} was merged before this rule; the AC trace found these not named in a test: ${missing.join(', ')}. Report them in "notes" only; they are not a finding and do not fail the ticket.`];
  }
  return [rule,
    `The automatic AC trace (scripts/conventions/ac-trace.mjs) found these acceptance criteria not named in any test: ${missing.join(', ')}.`,
    'Each one is a blocking finding (verdict "fail"): fix = name the id in the title or a comment of the test that proves it, adding that test if none does.',
    'Acceptance criteria of other tickets merged before this one that are not named in a test are not this ticket\'s problem: mention them in "notes" at most, never as a finding.'];
}

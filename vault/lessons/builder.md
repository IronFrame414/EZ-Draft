# Lessons · builder

Entries follow the format in PROCESS.md section 13. Keep under about 30; the wrap unit consolidates.

## L-010  areas: tooling, dependencies  seen: 1  status: candidate
Ticket EZD-008a, 2026-10-19
Mistake: the builder created the real Resend client with `as unknown as ResendClientLike`; the plan's contract said a real SDK instance must be assignable to that type, checked by typecheck, so the cast switched off the only proof that the SDK fits.
Cause: a forced cast was used to get past a type the plan meant as a check.
Rule: when a plan says a value "must be assignable" to a contract type, assign it to a variable of that type with no `as` cast; if tsc fails, report the error instead of casting.
Check: `grep -n "as unknown as" ` in the ticket's diff returns nothing for contract types; typecheck passes.

## L-012  areas: tooling, scripts  seen: 1  status: candidate
Ticket EZD-010b, 2026-10-19
Mistake: plan Step 2 said an unknown flag or a flag with no value fails, but no test in section 4 checked it; builder round 1 accepted `--names --list` and `--constructor x` with exit 0, and the code-reviewer failed it (one extra round, builder tier up).
Cause: a rule written in the Approach prose had no matching Tests row, so the gate could not catch it and the builder worked to the tests.
Rule: every "fails"/"refuses" rule in a plan's Approach has a Tests row with a failing input (planner), and the builder implements every Approach rule, not only those the tests check.
Check: the plan review lists each refuse/fail rule in the Approach and the test case that covers it; the code-reviewer runs any uncovered rule by hand.

## L-015  areas: tooling, scripts, release  seen: 1  status: candidate
Ticket EZD-023d, 2026-10-19
Mistake: the `supabase.dump` test fake created its output folder itself, so `dumpDatabase` passed every test without creating `<tmp>/dump`; the real CLI 2.121.0 fails `DbDumpOpenFileError … NotFound` on a missing folder, so every real release would have stopped at `dump_failed` (code-reviewer mode 3 FAIL, behavior).
Cause: the fake did more than the real tool does, hiding a precondition the code under test must meet.
Rule: a fake for an external tool does only what the real tool does (no creating folders, files or state the tool expects to exist); the builder makes every precondition the real tool needs (folders, files) itself rather than relying on the fake.
Check: the fake writes into a path it did not create and fails like the real tool when the path is missing.

# Lessons · builder

Entries follow the format in PROCESS.md section 13. Keep under about 30; the wrap unit consolidates.

## L-010  areas: tooling, dependencies  seen: 1  status: candidate
Ticket EZD-008a, 2026-10-19
Mistake: the builder created the real Resend client with `as unknown as ResendClientLike`; the plan's contract said a real SDK instance must be assignable to that type, checked by typecheck, so the cast switched off the only proof that the SDK fits.
Cause: a forced cast was used to get past a type the plan meant as a check.
Rule: when a plan says a value "must be assignable" to a contract type, assign it to a variable of that type with no `as` cast; if tsc fails, report the error instead of casting.
Check: `grep -n "as unknown as" ` in the ticket's diff returns nothing for contract types; typecheck passes.

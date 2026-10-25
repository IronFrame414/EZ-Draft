# Lessons · reviewer

Entries follow the format in PROCESS.md section 13. Keep under about 30; the wrap unit consolidates.

## L-001  areas: auth, security  seen: 1  status: ratified
Ticket EZD-033, 2026-10-18
Mistake: the security-reviewer set the minimum password length to 15 characters (Q-0094); Josh overrode it to 8 because the app holds no sensitive data.
Cause: a policy number was chosen from general guidance instead of being put to Josh as a product decision with the trade-off stated.
Rule: a user-facing policy number (password length, retention period, limit a user hits) is escalated to Josh with a recommendation; the reviewer does not decide it.
Check: a Stage 2 reviewer answer that fixes a user-facing number without a cited spec or decision source is sent back as escalated.

## L-007  areas: tooling, dependencies  seen: 1  status: ratified
Ticket EZD-004a, 2026-10-19
Mistake: the code-reviewer failed T1 on a reading of the Supabase CLI's Go source; the npm package `supabase@2.121.0` is a different (TypeScript) app, which prints JSON under a detected agent. The test-author's run of the real binary was right.
Cause: the source read was not tied to the exact package and version the repo installs.
Rule: a claim about a tool's behaviour cites the source of the package the lockfile installs (npm name and version), or a run of that binary; a different repo or binary in the same project does not count.
Check: a review finding about third-party output names the installed package path or the run that backs it.
- EZD-132 (2026-10-25): the security-reviewer answered Q-0269 (b) and raised S1, both putting permission reads in Storage policies, without checking AC-EZD-102-6 (no RLS policy reads permission rows) and EZD-102's D4; the conflict surfaced only at the gate after EZD-102 merged (Q-0323). Rule: before an answer or finding adds a check to an RLS policy (`storage.objects` included), read the approved ACs and machine checks that govern policies (EZD-102 AC-6, D4) and, on a conflict, escalate to Josh instead of answering.

# Lessons · reviewer

Entries follow the format in PROCESS.md section 13. Keep under about 30; the wrap unit consolidates.

## L-001  areas: auth, security  seen: 1  status: candidate
Ticket EZD-033, 2026-10-18
Mistake: the security-reviewer set the minimum password length to 15 characters (Q-0094); Josh overrode it to 8 because the app holds no sensitive data.
Cause: a policy number was chosen from general guidance instead of being put to Josh as a product decision with the trade-off stated.
Rule: a user-facing policy number (password length, retention period, limit a user hits) is escalated to Josh with a recommendation; the reviewer does not decide it.
Check: a Stage 2 reviewer answer that fixes a user-facing number without a cited spec or decision source is sent back as escalated.

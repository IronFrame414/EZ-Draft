# Fix mode · 2026-10-19 · EZD-008b precondition
Fault: .claude/hooks/guard-paths.mjs denies the builder scripts/email/, which vault/plans/EZD-008b.md section 9 names for scripts/email/send-test.mjs.
Fix: builder exception for scripts/email/ in the same form as Q-0124 (a) and Q-0148, under Q-0125 (a) and Q-0153 (a). Removed when the fix is committed.

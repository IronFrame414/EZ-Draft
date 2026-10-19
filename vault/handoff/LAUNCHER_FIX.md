# Fix mode · 2026-10-19 · EZD-023a precondition
Fault: .claude/hooks/guard-paths.mjs denies the builder scripts/release/, which vault/plans/EZD-023a.md section 1 Precondition names for scripts/release/*.mjs.
Fix: builder exception for scripts/release/ in the same form as Q-0124 (a), Q-0148 and Q-0153 (a), under Q-0125 (a). Removed when the fix is committed.

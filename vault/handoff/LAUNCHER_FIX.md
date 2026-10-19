# Fix mode · 2026-10-19 · EZD-004a precondition
Fault: .claude/hooks/guard-paths.mjs denies the builder scripts/db/, which vault/plans/EZD-004a.md section 9 (finding F3) names for scripts/db/local.mjs and gen-types.mjs.
Fix: builder exception for scripts/db/ in the same form as Q-0124 (a), under Q-0125 (a) and Q-0148. Removed when the fix is committed.

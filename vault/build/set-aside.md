# Set-aside tickets

Tickets the build loop could not finish. Each keeps its branch and worktree for review.
To retry one, delete its entry from vault/build/state.json `set_aside` (the loop picks it up again).

## EZD-105b · Owner-set password
- When: 2026-11-13T09:53:26Z
- Reason: review still failing after 2 fix rounds
- Branch: t/EZD-105b · worktree: .claude/worktrees/EZD-105b
- Last output:
```
[
 {
  "file": "supabase/migrations/20261113130000_create_owner_password_functions.sql",
  "line": 159,
  "problem": "AC-EZD-105b-4 is not met: record_member_password_set writes no event_log row (the private.write_event_log call is only a comment because event_log does not exist until EZD-109). server/users/owner-password.ts emits user.password_set after commit instead, which the plan forbids, and the plan's database tests for one row per success and rollback on a failed log write are absent.",
  "fix": "Build EZD-109 first (already added to depends_on). Then in a new migration call private.write_event_log('user.password_set', 'membership', p_membership_id, jsonb_build_object('appUserId', v_user), p_ip) after private.end_user_sessions in record_member_password_set, remove the emit in app/src/server/users/owner-password.ts, and add the one-row and rolled-back-on-log-failure database tests (plan D3, D4)."
 }
]
```

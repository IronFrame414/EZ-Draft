// EZD-102 section 3 harness row (vault/plans/EZD-102.md): the write paths that need no
// requireApiPermission( call, each with its reason. New entries need code-reviewer and security-reviewer
// approval.
export const WRITE_PERMISSION_EXEMPTIONS: ReadonlyArray<{ path: string; reason: string }> = [
  {
    path: 'app/src/app/api/monitoring/route.ts',
    reason: 'public error tunnel, no user (EZD-024)',
  },
  {
    path: 'app/src/app/api/dev/jobs/route.ts',
    reason: 'dev only, 404 in production; enqueue_job checks scope (EZD-009)',
  },
  {
    path: 'app/src/server/auth/actions.ts',
    reason: 'sign-in, before a member session (EZD-007d, EZD-033)',
  },
];

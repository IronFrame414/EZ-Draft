// EZD-102 section 3 harness row (vault/plans/EZD-102.md): the write paths that need no
// requireApiPermission( call, each with its reason. New entries need code-reviewer and security-reviewer
// approval.
export const WRITE_PERMISSION_EXEMPTIONS: ReadonlyArray<{ path: string; reason: string }> = [
  {
    path: 'app/src/app/api/monitoring/route.ts',
    reason: 'public error tunnel, no user (EZD-024)',
  },
  {
    path: 'app/src/server/auth/actions.ts',
    reason: 'sign-in, before a member session (EZD-007d, EZD-033)',
  },
  {
    path: 'app/src/app/api/profile/route.ts',
    reason: 'own profile; every signed-in user, S15 Permissions (EZD-108)',
  },
  {
    path: 'app/src/app/api/profile/password/route.ts',
    reason: 'own password; every signed-in user, Q-0096 P6 (EZD-108)',
  },
  {
    path: 'app/src/app/api/profile/notifications/route.ts',
    reason:
      'every user changes their own notification settings; no permission switch (S15; Q-0393; EZD-140)',
  },
];

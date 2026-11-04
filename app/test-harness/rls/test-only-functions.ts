// EZD-323 Step 1 (vault/plans/EZD-323.md): database functions whose name marks them test-only (`test` or
// `dev` as a whole word). The audit (`auditRls`, audit.ts) fails when `anon` or `authenticated` may execute
// one, when one is not listed here, and when an entry here no longer exists. Every entry carries a reason;
// the security-reviewer approves it.
export const TEST_ONLY_NAME: RegExp = /(^|[^a-z0-9])(test|dev)([^a-z0-9]|$)/i;

export function isTestOnlyName(proname: string): boolean {
  return TEST_ONLY_NAME.test(proname);
}

export type TestOnlyFunction = { fn: string; reason: string };

export const TEST_ONLY_FUNCTIONS: readonly TestOnlyFunction[] = [
  {
    fn: 'public.send_test_notification(uuid, text, uuid, jsonb)',
    reason: 'The /dev/notifications sender; service_role only (EZD-323).',
  },
];

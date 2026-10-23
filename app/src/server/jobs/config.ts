// EZD-009 Step 4 (vault/plans/EZD-009.md): the queue's time and retry values. The function time limit is
// Vercel Pro's default, 300 s (Q-0027 (a)); the sweep route exports the same number as its literal
// maxDuration. Up to 5 tries per job step, waiting 1, 2, 4 and 8 minutes (Q-0059 (a)).
export const JOB_FUNCTION_MAX_SECONDS = 300;
export const JOB_LEASE_SECONDS = JOB_FUNCTION_MAX_SECONDS + 60;
export const JOB_RUN_BUDGET_MS = (JOB_FUNCTION_MAX_SECONDS - 30) * 1000;
export const JOB_MIN_CLAIM_MS = 10000;

export type RunnerConfig = {
  leaseSeconds: number;
  runBudgetMs: number;
  minClaimMs: number;
  maxAttemptsDefault: number;
  backoff: { baseMs: number; capMs: number };
};

export function defaultRunnerConfig(): RunnerConfig {
  return {
    leaseSeconds: JOB_LEASE_SECONDS,
    runBudgetMs: JOB_RUN_BUDGET_MS,
    minClaimMs: JOB_MIN_CLAIM_MS,
    maxAttemptsDefault: 5,
    backoff: { baseMs: 60000, capMs: 480000 },
  };
}

// The wait after the given number of tries: min(baseMs x 2^(attempts - 1), capMs).
export function jobBackoffMs(
  attempts: number,
  backoff: { baseMs: number; capMs: number } = defaultRunnerConfig().backoff,
): number {
  return Math.min(backoff.baseMs * 2 ** (attempts - 1), backoff.capMs);
}

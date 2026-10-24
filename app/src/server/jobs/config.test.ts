// EZD-009 T9 (vault/plans/EZD-009.md Tests): the queue's time and retry values. Expected numbers: Q-0027 (a)
// (300 s), Q-0059 (a) (5 tries; waits 1, 2, 4, 8 minutes), Step 4 formulas (lease = max + 60, budget =
// (max - 30) x 1000, cap = the longest wait named).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  defaultRunnerConfig,
  JOB_FUNCTION_MAX_SECONDS,
  JOB_LEASE_SECONDS,
  JOB_MIN_CLAIM_MS,
  JOB_RUN_BUDGET_MS,
  jobBackoffMs,
} from './config';

const here = path.dirname(fileURLToPath(import.meta.url));
const sweepRoute = path.resolve(here, '..', '..', 'app', 'api', 'jobs', 'sweep', 'route.ts');

describe('EZD-009 job queue config', () => {
  it('EZD-009 T9 config: time limit, lease, budget, attempts and backoff', () => {
    expect(JOB_FUNCTION_MAX_SECONDS).toBe(300);
    const literal = /export\s+const\s+maxDuration\s*=\s*(\d+)/.exec(
      readFileSync(sweepRoute, 'utf8'),
    );
    expect(Number(literal?.[1])).toBe(300);
    expect(JOB_LEASE_SECONDS).toBe(360);
    expect(JOB_RUN_BUDGET_MS).toBe(270000);
    expect(JOB_MIN_CLAIM_MS).toBe(10000);

    const config = defaultRunnerConfig();
    expect(config.maxAttemptsDefault).toBe(5);
    expect(config.backoff.baseMs).toBe(60000);
    expect(config.backoff.capMs).toBe(480000);

    const waits = [1, 2, 3, 4, 5].map((n) => jobBackoffMs(n, config.backoff));
    expect(waits).toEqual([60000, 120000, 240000, 480000, 480000]);
  });
});

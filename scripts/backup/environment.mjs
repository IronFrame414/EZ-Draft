// EZD-025 Step 3 (vault/plans/EZD-025.md; Q-0112 finding 2): in GitHub Actions the backup runs refuse unless the
// `release` environment allows `main` only with no admin bypass, before any secret is read.
import { evaluateEnvironmentRule } from '../release/github-api.mjs';

/** `{ ok: true }` or `{ ok: false, code: 'environment_unprotected', reason }`; outside Actions `github` is not called. */
export async function checkBackupEnvironment(processEnv, github) {
  if (processEnv.GITHUB_ACTIONS !== 'true') return { ok: true };
  let rule = null;
  try {
    rule = await github.environmentBranchRule('release');
  } catch {
    rule = null; // fails closed: evaluateEnvironmentRule(null) is `no_rule`
  }
  const verdict = evaluateEnvironmentRule(rule);
  if (verdict.ok) return { ok: true };
  return { ok: false, code: 'environment_unprotected', reason: verdict.reason };
}

// EZD-023b Step 3 (vault/plans/EZD-023b.md): the GitHub REST client the release uses and the pure environment
// rule check. Node 22 built-ins and the injected `fetch` only. Endpoints, fields and headers: R-004 items 1–5;
// the rule's field shape: a read-only `gh api` of this repo's environments on 2026-10-19 (plan section 2).
// EZD-025 imports `createGitHubApi` and `evaluateEnvironmentRule`.

const API_VERSION = '2022-11-28';

/**
 * `{ mergedPullsFor, environmentBranchRule, createTag }`, all async. Every request goes to
 * `https://api.github.com/repos/<repo>/…` with the three headers; a non-2xx status throws an error naming the
 * method, path and status, never the token (Q-0112 finding 7). Building the client sends nothing.
 */
export function createGitHubApi({ token, repo, fetch }) {
  const base = `https://api.github.com/repos/${repo}`;

  async function request(method, pathAndQuery, body) {
    const init = {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': API_VERSION,
        Authorization: `Bearer ${token}`,
      },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetch(`${base}${pathAndQuery}`, init);
    if (!res.ok) throw new Error(`${method} ${pathAndQuery} failed: ${res.status}`);
    return res.json();
  }

  return {
    /** GET /commits/{sha}/pulls: the parsed array as GitHub sends it. */
    async mergedPullsFor(sha) {
      return request('GET', `/commits/${sha}/pulls`);
    },

    /**
     * GET /environments/{name}, plus its deployment branch policies (first page only) when custom branch
     * policies are on. `branch_policies` is `[{ name, type }]`, `[]` when the second call is not made.
     */
    async environmentBranchRule(name) {
      const env = await request('GET', `/environments/${name}`);
      const policy = env?.deployment_branch_policy ?? null;
      let branchPolicies = [];
      if (policy?.custom_branch_policies === true) {
        const page = await request('GET', `/environments/${name}/deployment-branch-policies?per_page=100`);
        branchPolicies = (page?.branch_policies ?? []).map((p) => ({ name: p.name, type: p.type }));
      }
      return {
        deployment_branch_policy: policy,
        can_admins_bypass: env?.can_admins_bypass,
        branch_policies: branchPolicies,
      };
    },

    /** POST /git/tags (the annotated tag object), then POST /git/refs pointing at it (R-004 item 4). */
    async createTag(name, sha, message) {
      const tagObject = await request('POST', '/git/tags', { tag: name, message, object: sha, type: 'commit' });
      await request('POST', '/git/refs', { ref: `refs/tags/${name}`, sha: tagObject.sha });
    },
  };
}

/**
 * `{ ok: true, reason: null }` only for a rule that is "selected branches" with exactly `main` (type branch)
 * and no admin bypass (Q-0106; Q-0112 finding 2). Checks stop at the first failure; a missing field fails closed.
 */
export function evaluateEnvironmentRule(rule) {
  if (rule === null || rule === undefined) return { ok: false, reason: 'no_rule' };
  const policy = rule.deployment_branch_policy;
  if (policy === null) return { ok: false, reason: 'all_branches' };
  if (policy?.protected_branches !== false || policy?.custom_branch_policies !== true) {
    return { ok: false, reason: 'not_selected_branches' };
  }
  const policies = Array.isArray(rule.branch_policies) ? rule.branch_policies : [];
  const mainOnly = policies.length === 1 && policies[0]?.name === 'main' && policies[0]?.type === 'branch';
  if (!mainOnly) return { ok: false, reason: 'not_main_only' };
  if (rule.can_admins_bypass !== false) return { ok: false, reason: 'admin_bypass' };
  return { ok: true, reason: null };
}

// EZD-023b T4 (pure cases) and T22 (vault/plans/EZD-023b.md section 4). node:test, pure, fake `fetch`; nothing
// reaches GitHub. Paths, fields and headers come from R-004 items 1–5; the rule shapes from the live `release`
// rule (plan section 2); reasons from Step 3; no token in error text from Q-0112 finding 7.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('../github-api.mjs');

const S = 'a'.repeat(40);
const TAG_SHA = 'b'.repeat(40);
const TOKEN = 'ghs_TEST';
const REPO = 'IronFrame414/EZ-Draft';
const BASE = `https://api.github.com/repos/${REPO}`;
const HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  Authorization: `Bearer ${TOKEN}`,
};

const selected = { protected_branches: false, custom_branch_policies: true };
const MAIN = { name: 'main', type: 'branch' };
const CLEAN_RULE = { deployment_branch_policy: selected, can_admins_bypass: false, branch_policies: [MAIN] };

/**
 * A fake fetch: `answer(call)` returns `{ status, body }` for the recorded call `{ url, method, headers, body }`.
 * Replies are real `Response` objects, so `ok`, `status` and `json()` all work.
 */
function fakeFetch(answer) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const call = {
      url: String(url),
      method: init.method ?? 'GET',
      headers: init.headers,
      body: init.body === undefined ? undefined : JSON.parse(init.body),
    };
    calls.push(call);
    const { status, body } = answer(call, calls.length);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetch, calls };
}

function assertHeaders(call, id) {
  for (const [k, v] of Object.entries(HEADERS)) assert.equal(call.headers?.[k], v, `(${id}) header ${k}`);
}

describe('EZD-023b GitHub API client and environment rule', () => {
  test('EZD-023b T4 evaluateEnvironmentRule: pure cases fail closed, the live release rule passes', async () => {
    const { evaluateEnvironmentRule } = await load();
    const cases = [
      ['a', { deployment_branch_policy: null, can_admins_bypass: false, branch_policies: [] }, 'all_branches'],
      [
        'b',
        {
          deployment_branch_policy: { protected_branches: true, custom_branch_policies: false },
          can_admins_bypass: false,
          branch_policies: [],
        },
        'not_selected_branches',
      ],
      [
        'c',
        {
          deployment_branch_policy: selected,
          can_admins_bypass: false,
          branch_policies: [MAIN, { name: 'develop', type: 'branch' }],
        },
        'not_main_only',
      ],
      [
        'd',
        {
          deployment_branch_policy: selected,
          can_admins_bypass: false,
          branch_policies: [MAIN, { name: 'phase-*', type: 'tag' }],
        },
        'not_main_only',
      ],
      ['e', { deployment_branch_policy: selected, can_admins_bypass: true, branch_policies: [MAIN] }, 'admin_bypass'],
      ['f', { deployment_branch_policy: selected, branch_policies: [MAIN] }, 'admin_bypass'],
      ['null', null, 'no_rule'],
    ];
    for (const [id, rule, reason] of cases) {
      assert.deepEqual(evaluateEnvironmentRule(rule), { ok: false, reason }, `(${id})`);
    }
    assert.deepEqual(evaluateEnvironmentRule(CLEAN_RULE), { ok: true, reason: null }, 'CLEAN rule');
  });

  test('EZD-023b T22 createGitHubApi: requests, headers, results and error text', async () => {
    const { createGitHubApi, evaluateEnvironmentRule } = await load();

    // (a) mergedPullsFor: one GET to /commits/{sha}/pulls with the three headers.
    {
      const pulls = [{ number: 7, title: 'Phase 0: Setup', merged_at: '2026-10-19T12:00:00Z', base: { ref: 'main' }, merge_commit_sha: S }];
      const f = fakeFetch(() => ({ status: 200, body: pulls }));
      const api = createGitHubApi({ token: TOKEN, repo: REPO, fetch: f.fetch });
      const result = await api.mergedPullsFor(S);
      assert.equal(f.calls.length, 1, '(a) one request');
      assert.equal(f.calls[0].method, 'GET');
      assert.equal(f.calls[0].url, `${BASE}/commits/${S}/pulls`);
      assertHeaders(f.calls[0], 'a');
      assert.deepEqual(result, pulls, '(a) the parsed array as GitHub sends it');
    }

    // (b) environmentBranchRule with selected branches: two GETs in order, the merged rule passes.
    {
      const f = fakeFetch((call) => {
        if (call.url === `${BASE}/environments/release`) {
          return {
            status: 200,
            body: { name: 'release', can_admins_bypass: false, deployment_branch_policy: selected },
          };
        }
        if (call.url === `${BASE}/environments/release/deployment-branch-policies?per_page=100`) {
          return { status: 200, body: { total_count: 1, branch_policies: [{ id: 1, name: 'main', type: 'branch' }] } };
        }
        return { status: 404, body: { message: 'Not Found' } };
      });
      const api = createGitHubApi({ token: TOKEN, repo: REPO, fetch: f.fetch });
      const rule = await api.environmentBranchRule('release');
      assert.deepEqual(
        f.calls.map((c) => [c.method, c.url]),
        [
          ['GET', `${BASE}/environments/release`],
          ['GET', `${BASE}/environments/release/deployment-branch-policies?per_page=100`],
        ],
        '(b) the two GETs in order',
      );
      for (const c of f.calls) assertHeaders(c, 'b');
      assert.deepEqual(rule, CLEAN_RULE, '(b) merged rule');
      assert.equal(evaluateEnvironmentRule(rule).ok, true, '(b) the live rule passes');
    }

    // (c) all branches: exactly one fetch; no policies; all_branches.
    {
      const f = fakeFetch(() => ({
        status: 200,
        body: { name: 'release', can_admins_bypass: true, deployment_branch_policy: null },
      }));
      const api = createGitHubApi({ token: TOKEN, repo: REPO, fetch: f.fetch });
      const rule = await api.environmentBranchRule('release');
      assert.equal(f.calls.length, 1, '(c) exactly 1 fetch');
      assert.deepEqual(rule.branch_policies, [], '(c) branch_policies');
      assert.deepEqual(evaluateEnvironmentRule(rule), { ok: false, reason: 'all_branches' });
    }

    // (d) createTag: the tag object, then the ref pointing at the tag object's sha.
    {
      const f = fakeFetch((call, n) => {
        if (n === 1) return { status: 201, body: { sha: TAG_SHA, tag: 'phase-0' } };
        return { status: 201, body: { ref: 'refs/tags/phase-0', object: { sha: TAG_SHA } } };
      });
      const api = createGitHubApi({ token: TOKEN, repo: REPO, fetch: f.fetch });
      await api.createTag('phase-0', S, 'Release phase-0 (#7)');
      assert.equal(f.calls.length, 2, '(d) two POSTs');
      assert.equal(f.calls[0].method, 'POST');
      assert.equal(f.calls[0].url, `${BASE}/git/tags`);
      assert.deepEqual(f.calls[0].body, {
        tag: 'phase-0',
        message: 'Release phase-0 (#7)',
        object: S,
        type: 'commit',
      });
      assert.equal(f.calls[1].method, 'POST');
      assert.equal(f.calls[1].url, `${BASE}/git/refs`);
      assert.deepEqual(f.calls[1].body, { ref: 'refs/tags/phase-0', sha: TAG_SHA });
      for (const c of f.calls) assertHeaders(c, 'd');
    }

    // (e) a 403 rejects each method; the message names the status and never the token.
    {
      const f = fakeFetch(() => ({ status: 403, body: { message: 'Resource not accessible by integration' } }));
      const api = createGitHubApi({ token: TOKEN, repo: REPO, fetch: f.fetch });
      const attempts = [
        ['a', () => api.mergedPullsFor(S)],
        ['b', () => api.environmentBranchRule('release')],
        ['d', () => api.createTag('phase-0', S, 'Release phase-0 (#7)')],
      ];
      for (const [id, run] of attempts) {
        await assert.rejects(run, (err) => {
          const message = err instanceof Error ? err.message : String(err);
          assert.ok(message.includes('403'), `(e ${id}) message names the status: ${message}`);
          assert.ok(!message.includes(TOKEN), `(e ${id}) message holds no token`);
          return true;
        });
      }
    }
  });
});

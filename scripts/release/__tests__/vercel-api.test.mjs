// EZD-023c T23 (vault/plans/EZD-023c.md section 4). node:test, pure, fake `fetch`; nothing reaches Vercel. Paths,
// fields and enum values come from R-005 items 1-3, 9-13, 16-19, 21-25 as the plan's Step 1 and T23 table state them.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('../vercel-api.mjs');

const S = 'a'.repeat(40);
const API = 'https://api.vercel.com';
const Q = 'teamId=team_TEST';

/** `answer(call)` returns `{ status, body }` or throws (a rejected fetch). Replies are real `Response`s. */
function fakeFetch(answer) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method ?? 'GET', headers: init.headers, body: init.body };
    calls.push(call);
    const { status = 200, body = {} } = answer(call, calls.length);
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  return { fetch, calls };
}
const make = (create, answer) => {
  const f = fakeFetch(answer);
  const api = create({ token: 'tok_TEST', projectId: 'prj_TEST', teamId: 'team_TEST', fetch: f.fetch });
  return { api, calls: f.calls };
};
const AUTH = { Authorization: 'Bearer tok_TEST' };

describe('EZD-023c Vercel client requests', () => {
  test('EZD-023c T23 (a)-(g) requests and results', async () => {
    const { createVercelApi } = await load();

    // (a)
    {
      const { api, calls } = make(createVercelApi, () => ({
        body: {
          autoAssignCustomDomains: false,
          ssoProtection: { deploymentType: 'all' },
          gitForkProtection: true,
          name: 'ezdraft',
          targets: { production: { id: 'dpl_OLD' } },
        },
      }));
      const r = await api.getProject();
      assert.equal(calls.length, 1);
      assert.equal(calls[0].method, 'GET');
      assert.equal(calls[0].url, `${API}/v9/projects/prj_TEST?${Q}`);
      assert.deepEqual(calls[0].headers, AUTH);
      assert.deepEqual(r, {
        autoAssignCustomDomains: false,
        ssoProtection: { deploymentType: 'all' },
        gitForkProtection: true,
      });
    }

    // (b)
    {
      let n = 0;
      const { api, calls } = make(createVercelApi, () => ({
        body: ++n === 1 ? { token: { expiresAt: 1800000000000 } } : { token: {} },
      }));
      assert.deepEqual(await api.tokenInfo(), { expiresAt: 1800000000000 });
      assert.deepEqual(await api.tokenInfo(), { expiresAt: null });
      assert.equal(calls[0].url, `${API}/v5/user/tokens/current?${Q}`);
    }

    // (c)
    {
      const full = [
        { uid: 'dpl_BUILD', target: 'production', readyState: 'BUILDING', meta: { githubCommitSha: S } },
        { uid: 'dpl_PREV', target: null, readyState: 'READY', meta: { githubCommitSha: S } },
        { uid: 'dpl_NEW', target: 'production', readyState: 'READY', meta: { githubCommitSha: S } },
      ];
      const lists = [full, [full[0]], []];
      let n = 0;
      const { api, calls } = make(createVercelApi, () => ({ body: { deployments: lists[n++] } }));
      assert.deepEqual(await api.findProductionDeployment(S), { id: 'dpl_NEW', state: 'READY' });
      assert.deepEqual(await api.findProductionDeployment(S), { id: 'dpl_BUILD', state: 'BUILDING' });
      assert.equal(await api.findProductionDeployment(S), null);
      assert.equal(
        calls[0].url,
        `${API}/v7/deployments?projectId=prj_TEST&target=production&limit=20&${Q}`,
      );
    }

    // (d)
    {
      const bodies = [{ targets: { production: { id: 'dpl_OLD' } } }, {}];
      let n = 0;
      const { api, calls } = make(createVercelApi, () => ({ body: bodies[n++] }));
      assert.deepEqual(await api.currentProductionDeployment(), { id: 'dpl_OLD' });
      assert.equal(await api.currentProductionDeployment(), null);
      assert.equal(calls[0].url, `${API}/v9/projects/prj_TEST?${Q}`);
    }

    // (e)
    {
      let n = 0;
      const { api, calls } = make(createVercelApi, () => ({
        body:
          ++n === 1
            ? {
                envs: [
                  { id: 'env_1', key: 'A', target: ['preview'], gitBranch: null, value: 'secret-1' },
                  { id: 'env_2', key: 'B', target: 'production', gitBranch: 'x', value: 'secret-2' },
                ],
              }
            : { envs: [], pagination: { next: 123 } },
      }));
      const list = await api.listEnv();
      assert.equal(calls[0].url, `${API}/v10/projects/prj_TEST/env?${Q}`);
      assert.equal(list.length, 2);
      for (const item of list) assert.ok(!('value' in item), 'no value key');
      assert.deepEqual(list[0], { id: 'env_1', key: 'A', target: ['preview'], gitBranch: null });
      await assert.rejects(() => api.listEnv());
    }

    // (f)
    {
      const bodies = [
        { decrypted: true, type: 'encrypted', value: 'stub' },
        { type: 'plain', value: 'https://x.supabase.co' },
        { type: 'sensitive', decrypted: false, value: 'eyJenc' },
        {},
      ];
      let n = 0;
      const { api, calls } = make(createVercelApi, () => ({ body: bodies[n++] }));
      assert.equal(await api.readEnvValue('env_1'), 'stub');
      assert.equal(await api.readEnvValue('env_1'), 'https://x.supabase.co');
      assert.equal(await api.readEnvValue('env_1'), null);
      assert.equal(await api.readEnvValue('env_1'), null);
      assert.equal(calls[0].url, `${API}/v1/projects/prj_TEST/env/env_1?${Q}`);
    }

    // (g)
    {
      const { api, calls } = make(createVercelApi, () => ({ status: 201, body: {} }));
      await api.promote('dpl_NEW');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].method, 'POST');
      assert.equal(calls[0].url, `${API}/v10/projects/prj_TEST/promote/dpl_NEW?${Q}`);
      assert.equal(calls[0].body, undefined);
      assert.deepEqual(calls[0].headers, AUTH);
    }
  });

  test('EZD-023c T23 (h) errors name neither ids nor token nor body', async () => {
    const { createVercelApi } = await load();
    const calls = (api) => [
      () => api.getProject(),
      () => api.tokenInfo(),
      () => api.findProductionDeployment(S),
      () => api.currentProductionDeployment(),
      () => api.listEnv(),
      () => api.readEnvValue('env_1'),
      () => api.promote('dpl_NEW'),
    ];
    const check = (e, expect) => {
      assert.ok(e instanceof Error);
      assert.ok(e.message.includes(expect), `message ${JSON.stringify(e.message)} has ${expect}`);
      for (const v of ['tok_TEST', 'prj_TEST', 'team_TEST', 'Not authorized', 'dpl_NEW', 'env_1']) {
        assert.ok(!e.message.includes(v), `message ${JSON.stringify(e.message)} holds ${v}`);
      }
      return true;
    };
    const forbidden = make(createVercelApi, () => ({
      status: 403,
      body: { error: { code: 'forbidden', message: 'Not authorized prj_TEST' } },
    }));
    for (const call of calls(forbidden.api)) await assert.rejects(call, (e) => check(e, '403'));

    const f = {
      fetch: async () => {
        throw new Error('connect ECONNREFUSED https://api.vercel.com/v9/projects/prj_TEST?teamId=team_TEST');
      },
    };
    const api = createVercelApi({ token: 'tok_TEST', projectId: 'prj_TEST', teamId: 'team_TEST', fetch: f.fetch });
    for (const call of calls(api)) await assert.rejects(call, (e) => check(e, 'network'));
  });

  test('EZD-023c T23 (i) evaluateVercelProject and PROTECTED_DEPLOYMENT_TYPES', async () => {
    const { evaluateVercelProject, PROTECTED_DEPLOYMENT_TYPES } = await load();
    assert.ok(Object.isFrozen(PROTECTED_DEPLOYMENT_TYPES));
    assert.deepEqual(
      [...PROTECTED_DEPLOYMENT_TYPES],
      ['all', 'all_except_custom_domains', 'preview', 'prod_deployment_urls_and_all_previews'],
    );
    const clean = {
      autoAssignCustomDomains: false,
      ssoProtection: { deploymentType: 'prod_deployment_urls_and_all_previews' },
      gitForkProtection: true,
    };
    const passes = { ok: true, code: null };
    assert.deepEqual(evaluateVercelProject(clean), passes, 'clean');
    for (const deploymentType of PROTECTED_DEPLOYMENT_TYPES) {
      assert.deepEqual(evaluateVercelProject({ ...clean, ssoProtection: { deploymentType } }), passes, deploymentType);
    }
    const fail = (code) => ({ ok: false, code });
    const noAuto = { ...clean };
    delete noAuto.autoAssignCustomDomains;
    const noGit = { ...clean };
    delete noGit.gitForkProtection;
    assert.deepEqual(evaluateVercelProject({ ...clean, autoAssignCustomDomains: true }), fail('vercel_auto_assign_on'));
    assert.deepEqual(evaluateVercelProject(noAuto), fail('vercel_auto_assign_on'));
    assert.deepEqual(
      evaluateVercelProject({ ...clean, autoAssignCustomDomains: true, ssoProtection: null }),
      fail('vercel_auto_assign_on'),
    );
    assert.deepEqual(evaluateVercelProject(null), fail('vercel_auto_assign_on'));
    assert.deepEqual(evaluateVercelProject({ ...clean, ssoProtection: null }), fail('deployment_protection_off'));
    assert.deepEqual(
      evaluateVercelProject({ ...clean, ssoProtection: { deploymentType: 'none' } }),
      fail('deployment_protection_off'),
    );
    assert.deepEqual(evaluateVercelProject({ ...clean, ssoProtection: {} }), fail('deployment_protection_off'));
    assert.deepEqual(evaluateVercelProject({ ...clean, gitForkProtection: false }), fail('deployment_protection_off'));
    assert.deepEqual(evaluateVercelProject(noGit), fail('deployment_protection_off'));
    assert.deepEqual(evaluateVercelProject({ ...clean, gitForkProtection: null }), fail('deployment_protection_off'));
  });
});

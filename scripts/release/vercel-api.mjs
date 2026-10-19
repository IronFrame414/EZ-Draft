// EZD-023c Step 1 (vault/plans/EZD-023c.md): the Vercel REST client the release uses and the pure project
// check. Node 22 built-ins and the injected `fetch` only. Endpoints, fields and error shape: R-005.
// Error text holds the method, a path template and the status, never the token or any id (Q-0112 finding 7).

const BASE = 'https://api.vercel.com';

/** The `ssoProtection.deploymentType` values that protect previews (R-005 item 3). */
export const PROTECTED_DEPLOYMENT_TYPES = Object.freeze([
  'all',
  'all_except_custom_domains',
  'preview',
  'prod_deployment_urls_and_all_previews',
]);

const isObject = (v) => typeof v === 'object' && v !== null;

/** `{ getProject, tokenInfo, findProductionDeployment, currentProductionDeployment, listEnv, readEnvValue, promote }`. */
export function createVercelApi({ token, projectId, teamId, fetch }) {
  const enc = encodeURIComponent;
  const project = enc(projectId);

  async function request(method, template, path, query = '') {
    const q = query === '' ? '' : `${query}&`;
    let res;
    try {
      res = await fetch(`${BASE}${path}?${q}teamId=${enc(teamId)}`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      throw new Error(`Vercel ${method} ${template} failed: network`);
    }
    if (!res.ok) throw new Error(`Vercel ${method} ${template} failed: ${res.status}`);
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  const getProjectBody = () => request('GET', '/v9/projects/{project}', `/v9/projects/${project}`);

  return {
    async getProject() {
      const b = await getProjectBody();
      return {
        autoAssignCustomDomains: b?.autoAssignCustomDomains,
        ssoProtection: b?.ssoProtection,
        gitForkProtection: b?.gitForkProtection,
      };
    },

    async tokenInfo() {
      const b = await request('GET', '/v5/user/tokens/current', '/v5/user/tokens/current');
      const e = b?.token?.expiresAt;
      if (e === undefined || e === null) return { expiresAt: null };
      if (typeof e === 'number' && Number.isFinite(e)) return { expiresAt: e };
      throw new Error('Vercel GET /v5/user/tokens/current failed: bad_body');
    },

    async findProductionDeployment(sha) {
      const b = await request(
        'GET',
        '/v7/deployments',
        '/v7/deployments',
        `projectId=${project}&target=production&limit=20`,
      );
      const list = Array.isArray(b?.deployments) ? b.deployments : [];
      const matches = list
        .filter((d) => d && d.target === 'production' && d.meta?.githubCommitSha === sha)
        .map((d) => ({ id: d.uid ?? d.id, state: d.readyState ?? d.state }));
      return matches.find((m) => m.state === 'READY') ?? matches[0] ?? null;
    },

    async currentProductionDeployment() {
      const b = await getProjectBody();
      const id = b?.targets?.production?.id;
      return typeof id === 'string' && id !== '' ? { id } : null;
    },

    async listEnv() {
      const b = await request('GET', '/v10/projects/{project}/env', `/v10/projects/${project}/env`);
      if (b?.pagination?.next !== null && b?.pagination?.next !== undefined) {
        throw new Error('Vercel GET /v10/projects/{project}/env failed: more_pages');
      }
      return (Array.isArray(b?.envs) ? b.envs : []).map((e) => ({
        id: e.id,
        key: e.key,
        target: e.target,
        gitBranch: e.gitBranch,
      }));
    },

    async readEnvValue(id) {
      const b = await request(
        'GET',
        '/v1/projects/{project}/env/{id}',
        `/v1/projects/${project}/env/${enc(id)}`,
      );
      if (isObject(b) && typeof b.value === 'string' && (b.decrypted === true || b.type === 'plain')) {
        return b.value;
      }
      return null;
    },

    async promote(deploymentId) {
      await request(
        'POST',
        '/v10/projects/{project}/promote/{deployment}',
        `/v10/projects/${project}/promote/${enc(deploymentId)}`,
      );
    },
  };
}

/** `{ ok: true, code: null }` or `{ ok: false, code }`; a missing field counts as unsafe. */
export function evaluateVercelProject(project) {
  if (project?.autoAssignCustomDomains !== false) return { ok: false, code: 'vercel_auto_assign_on' };
  const sso = project.ssoProtection;
  if (!isObject(sso) || !PROTECTED_DEPLOYMENT_TYPES.includes(sso.deploymentType)) {
    return { ok: false, code: 'deployment_protection_off' };
  }
  if (project.gitForkProtection !== true) return { ok: false, code: 'deployment_protection_off' };
  return { ok: true, code: null };
}

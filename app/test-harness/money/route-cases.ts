// EZD-133 section 3 harness row `money/route-cases.ts` (vault/plans/EZD-133.md; C1, M1, M2): one case per
// exported method of every route, in the plan's order. Each request is the success request of that route's own
// route.test.ts unless the plan says otherwise; the status is the plan's (200 when not shown). `after` keeps the
// ids a later case needs in env.created. Test-only.
import { randomUUID } from 'node:crypto';
import { adminDb, type Member } from '../rls/fixtures';
import { NOTIFICATION_KINDS } from '../../src/lib/notifications/kinds';
import { DEV_SAMPLE_PARAMS } from '../../src/app/dev/notifications/NotificationsProbe';
import { logoPathFor } from '../../src/server/company/company';
import { uploadFile, type SignedUpload } from '../../src/lib/storage/upload';
import { THUMB_WEBP } from '../thumbnail/fixture';
import type { HttpMethod } from './routes';

export type CaseEnv = {
  tenantId: string;
  projectId: string;
  member: Member;
  created: Map<string, string>;
};

export type MoneyRouteCase = {
  file: string;
  method: HttpMethod;
  load: () => Promise<Record<string, unknown>>;
  request: (env: CaseEnv) => Promise<{ request: Request; params?: Record<string, string> }>;
  expectStatus: number;
  after?: (body: unknown, env: CaseEnv) => void;
  note?: string;
};

const BASE = 'http://localhost';
const API = 'app/src/app/api/';
const JSON_HEADERS = { 'content-type': 'application/json' };
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_100 = Uint8Array.from([...PNG_SIG, ...new Array(92).fill(0)]);

const get = (path: string) => async () => ({ request: new Request(`${BASE}${path}`) });
const sendJson = (method: string, path: string, body: unknown) => async () => ({
  request: new Request(`${BASE}${path}`, {
    method,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  }),
});
const made = (env: CaseEnv, key: string): string => {
  const v = env.created.get(key);
  if (v === undefined) throw new Error(`money case needs ${key} from an earlier case`);
  return v;
};
const field = (body: unknown, ...keys: string[]): string => {
  let v: unknown = body;
  for (const k of keys) v = (v as Record<string, unknown>)[k];
  if (typeof v !== 'string') throw new Error(`response has no string at ${keys.join('.')}`);
  return v;
};

const KIND = NOTIFICATION_KINDS[0];
const ALL_ON = NOTIFICATION_KINDS.map((kind) => ({ kind, inApp: true, email: true }));
const SETTINGS_CHANGED = ALL_ON.map((s) =>
  s.kind === 'edit_request' ? { ...s, inApp: false } : s,
);
const ANN = {
  name: 'Ann Lee',
  email: 'ann@example.test',
  phone: '561-555-0100',
  address: '1 Main St',
};
const ANN_EDIT = { name: 'Ann', email: 'ann@example.test', phone: '561-555-0199', address: '' };
const COMPANY = {
  name: 'EZD-112 T5 Renamed',
  licenseNo: '',
  contact: { phone: '', email: '', website: '', address: '' },
  logo: { action: 'keep' },
};

export const MONEY_ROUTE_CASES: readonly MoneyRouteCase[] = [
  {
    file: `${API}health/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/health/route'),
    request: get('/api/health'),
    expectStatus: 200,
  },
  {
    file: `${API}permissions/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/permissions/route'),
    request: get('/api/permissions'),
    expectStatus: 200,
  },
  {
    file: `${API}profile/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/profile/route'),
    request: get('/api/profile'),
    expectStatus: 200,
  },
  {
    file: `${API}profile/route.ts`,
    method: 'PATCH',
    load: () => import('../../src/app/api/profile/route'),
    request: sendJson('PATCH', '/api/profile', { language: 'es', ipadDrawing: 'pencil' }),
    expectStatus: 200,
  },
  {
    file: `${API}profile/notifications/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/profile/notifications/route'),
    request: get('/api/profile/notifications'),
    expectStatus: 200,
  },
  {
    file: `${API}profile/notifications/route.ts`,
    method: 'PUT',
    load: () => import('../../src/app/api/profile/notifications/route'),
    request: sendJson('PUT', '/api/profile/notifications', { settings: SETTINGS_CHANGED }),
    expectStatus: 200,
  },
  {
    file: `${API}realtime/token/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/realtime/token/route'),
    request: get('/api/realtime/token'),
    expectStatus: 200,
  },
  {
    file: `${API}dev/notifications/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/dev/notifications/route'),
    request: sendJson('POST', '/api/dev/notifications', {
      kind: KIND,
      params: DEV_SAMPLE_PARAMS[KIND],
    }),
    expectStatus: 201,
    after: (body, env) => env.created.set('notificationId', field(body, 'notification', 'id')),
  },
  {
    file: `${API}notifications/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/notifications/route'),
    request: get('/api/notifications'),
    expectStatus: 200,
  },
  {
    file: `${API}notifications/[id]/open/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/notifications/[id]/open/route'),
    request: async (env) => {
      const id = made(env, 'notificationId');
      return {
        request: new Request(`${BASE}/api/notifications/${id}/open`, { method: 'POST' }),
        params: { id },
      };
    },
    expectStatus: 200,
  },
  {
    file: `${API}notifications/read-all/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/notifications/read-all/route'),
    request: async () => ({
      request: new Request(`${BASE}/api/notifications/read-all`, { method: 'POST' }),
    }),
    expectStatus: 200,
  },
  {
    file: `${API}dev/jobs/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/dev/jobs/route'),
    request: async (env) =>
      sendJson('POST', '/api/dev/jobs', { projectId: env.projectId, steps: 1, stepMs: 0 })(),
    expectStatus: 201,
    after: (body, env) => env.created.set('jobId', field(body, 'job', 'id')),
  },
  {
    file: `${API}jobs/[id]/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/jobs/[id]/route'),
    request: async (env) => {
      const id = made(env, 'jobId');
      return { request: new Request(`${BASE}/api/jobs/${id}`), params: { id } };
    },
    expectStatus: 200,
  },
  {
    file: `${API}jobs/sweep/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/jobs/sweep/route'),
    request: get('/api/jobs/sweep'),
    expectStatus: 401,
    note: "sent without an authorization header: the success request would sweep other tests' jobs",
  },
  {
    file: `${API}monitoring/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/monitoring/route'),
    request: async () => ({
      request: new Request(`${BASE}/api/monitoring`, { method: 'POST', body: '' }),
    }),
    expectStatus: 400,
    note: 'an empty body is refused; a body of {} succeeds',
  },
  {
    file: `${API}dev/storage/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/dev/storage/route'),
    request: async (env) =>
      sendJson('POST', '/api/dev/storage', {
        projectId: env.projectId,
        kind: 'pdf',
        originalName: 'plan.pdf',
        contentType: 'application/pdf',
        size: 100,
      })(),
    expectStatus: 201,
    after: (body, env) => {
      env.created.set('sourceFileId', field(body, 'sourceFile', 'id'));
      env.created.set('storagePath', field(body, 'sourceFile', 'storagePath'));
    },
  },
  {
    file: `${API}dev/storage/[id]/complete/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/dev/storage/[id]/complete/route'),
    request: async (env) => {
      const id = made(env, 'sourceFileId');
      const { error } = await adminDb()
        .storage.from('sources')
        .upload(made(env, 'storagePath'), new Uint8Array(100).fill(0x61), {
          contentType: 'application/pdf',
        });
      if (error) throw new Error(`upload failed: ${error.message}`);
      return {
        request: new Request(`${BASE}/api/dev/storage/${id}/complete`, { method: 'POST' }),
        params: { id },
      };
    },
    expectStatus: 200,
  },
  {
    file: `${API}dev/permissions/projects/[id]/route.ts`,
    method: 'PATCH',
    load: () => import('../../src/app/api/dev/permissions/projects/[id]/route'),
    request: async (env) => ({
      ...(await sendJson('PATCH', `/api/dev/permissions/projects/${env.projectId}`, {
        name: 'Money check',
      })()),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
  },
  {
    file: `${API}dev/model/[id]/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/dev/model/[id]/route'),
    request: async (env) => ({
      request: new Request(`${BASE}/api/dev/model/${env.projectId}`, { method: 'GET' }),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-120d: the checkpoint count; 200 { checkpoints } (no money)',
  },
  {
    file: `${API}settings/customers/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/settings/customers/route'),
    request: get('/api/settings/customers'),
    expectStatus: 200,
  },
  {
    file: `${API}settings/customers/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/settings/customers/route'),
    request: sendJson('POST', '/api/settings/customers', ANN),
    expectStatus: 201,
    after: (body, env) => env.created.set('customerId', field(body, 'customer', 'id')),
  },
  {
    file: `${API}settings/customers/[id]/route.ts`,
    method: 'PATCH',
    load: () => import('../../src/app/api/settings/customers/[id]/route'),
    request: async (env) => {
      const id = made(env, 'customerId');
      return {
        ...(await sendJson('PATCH', `/api/settings/customers/${id}`, ANN_EDIT)()),
        params: { id },
      };
    },
    expectStatus: 200,
  },
  // EZD-131: the Settings > Libraries routes. POST adds one abbreviation; PATCH edits it and DELETE removes it.
  {
    file: `${API}settings/libraries/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/settings/libraries/route'),
    request: get('/api/settings/libraries?kind=abbreviation'),
    expectStatus: 200,
    note: 'EZD-131: one tab of library items; 200 { items } (no money)',
  },
  {
    file: `${API}settings/libraries/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/settings/libraries/route'),
    request: sendJson('POST', '/api/settings/libraries', {
      kind: 'abbreviation',
      name: 'GFCI',
      meaning: 'Ground-fault circuit interrupter',
    }),
    expectStatus: 201,
    after: (body, env) => env.created.set('libraryItemId', field(body, 'item', 'id')),
  },
  {
    file: `${API}settings/libraries/[id]/route.ts`,
    method: 'PATCH',
    load: () => import('../../src/app/api/settings/libraries/[id]/route'),
    request: async (env) => {
      const id = made(env, 'libraryItemId');
      return {
        ...(await sendJson('PATCH', `/api/settings/libraries/${id}`, {
          name: 'GFCI',
          meaning: 'Ground-fault circuit interrupter outlet',
        })()),
        params: { id },
      };
    },
    expectStatus: 200,
  },
  {
    file: `${API}settings/libraries/[id]/route.ts`,
    method: 'DELETE',
    load: () => import('../../src/app/api/settings/libraries/[id]/route'),
    request: async (env) => {
      const id = made(env, 'libraryItemId');
      return {
        request: new Request(`${BASE}/api/settings/libraries/${id}`, { method: 'DELETE' }),
        params: { id },
      };
    },
    expectStatus: 200,
  },
  {
    file: `${API}settings/system-status/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/settings/system-status/route'),
    request: get('/api/settings/system-status?part=jobs&page=1'),
    expectStatus: 200,
    note: 'EZD-135: failed jobs of the last 30 days; 200 StatusPage (no money)',
  },
  {
    file: `${API}settings/users/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/settings/users/route'),
    request: get('/api/settings/users'),
    expectStatus: 200,
  },
  // EZD-107: the custom role routes. POST makes one role with a fresh name; PATCH and DELETE aim at a role id no
  // company has, so the walk changes nothing else (404 role_not_found). No money field in any answer.
  {
    file: `${API}settings/roles/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/settings/roles/route'),
    request: get('/api/settings/roles'),
    expectStatus: 200,
  },
  {
    file: `${API}settings/roles/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/settings/roles/route'),
    request: async () =>
      sendJson('POST', '/api/settings/roles', {
        name: `Walk role ${randomUUID()}`,
        grantedKeys: ['view_projects'],
      })(),
    expectStatus: 201,
    note: 'EZD-107: a new custom role (no money)',
  },
  ...(['PATCH', 'DELETE'] as const).map((method): MoneyRouteCase => ({
    file: `${API}settings/roles/[id]/route.ts`,
    method,
    load: () => import('../../src/app/api/settings/roles/[id]/route'),
    request: async () => {
      const id = randomUUID();
      const path = `/api/settings/roles/${id}`;
      const made =
        method === 'PATCH'
          ? await sendJson('PATCH', path, { name: 'Walk', grantedKeys: [] })()
          : { request: new Request(`${BASE}${path}`, { method: 'DELETE' }) };
      return { ...made, params: { id } };
    },
    expectStatus: 404,
    note: 'EZD-107: unknown role; 404 role_not_found (no money)',
  })),
  // EZD-106: the member writes, aimed at a membership id no company has, so the walk changes no member; the
  // function answers 404 member_not_found (no money field in any answer).
  ...(['PATCH', 'DELETE'] as const).map((method): MoneyRouteCase => ({
    file: `${API}settings/users/[id]/route.ts`,
    method,
    load: () => import('../../src/app/api/settings/users/[id]/route'),
    request: async () => {
      const id = randomUUID();
      const path = `/api/settings/users/${id}`;
      const made =
        method === 'PATCH'
          ? await sendJson('PATCH', path, {
              roleId: randomUUID(),
              language: 'en',
              grantedKeys: [],
            })()
          : { request: new Request(`${BASE}${path}`, { method: 'DELETE' }) };
      return { ...made, params: { id } };
    },
    expectStatus: 404,
    note: 'EZD-106: unknown member; 404 member_not_found (no money)',
  })),
  ...(['deactivate', 'reactivate'] as const).map((kind): MoneyRouteCase => ({
    file: `${API}settings/users/[id]/${kind}/route.ts`,
    method: 'POST',
    load: () =>
      kind === 'deactivate'
        ? import('../../src/app/api/settings/users/[id]/deactivate/route')
        : import('../../src/app/api/settings/users/[id]/reactivate/route'),
    request: async () => {
      const id = randomUUID();
      return {
        request: new Request(`${BASE}/api/settings/users/${id}/${kind}`, { method: 'POST' }),
        params: { id },
      };
    },
    expectStatus: 404,
    note: 'EZD-106: unknown member; 404 member_not_found (no money)',
  })),
  // EZD-129: Project access. The [id] routes aim at a membership id no company has (404 member_not_found), so
  // the walk changes no member; the picker's project choices and the wizard's Foreman candidates answer 200. No
  // money field in any answer.
  ...(['GET', 'PUT'] as const).map((method): MoneyRouteCase => ({
    file: `${API}settings/users/[id]/scope/route.ts`,
    method,
    load: () => import('../../src/app/api/settings/users/[id]/scope/route'),
    request: async () => {
      const id = randomUUID();
      const path = `/api/settings/users/${id}/scope`;
      const made =
        method === 'PUT'
          ? await sendJson('PUT', path, { scope: 'listed', projectIds: [] })()
          : { request: new Request(`${BASE}${path}`) };
      return { ...made, params: { id } };
    },
    expectStatus: 404,
    note: 'EZD-129: unknown member; 404 member_not_found (no money)',
  })),
  {
    file: `${API}settings/users/projects/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/settings/users/projects/route'),
    request: get('/api/settings/users/projects'),
    expectStatus: 200,
    note: 'EZD-129: project id, name and address only (no money)',
  },
  {
    file: `${API}projects/foremen/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/projects/foremen/route'),
    request: get('/api/projects/foremen'),
    expectStatus: 200,
    note: 'EZD-129: member id, name, email and scope only (no money)',
  },
  // EZD-105: the invite routes. POST sends an email that is not one (400 invalid_email, nothing written); the
  // [id] routes aim at a membership id no company has (404 member_not_found). No money field in any answer.
  {
    file: `${API}settings/users/invites/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/settings/users/invites/route'),
    request: sendJson('POST', '/api/settings/users/invites', {
      email: 'not-an-email',
      roleId: randomUUID(),
    }),
    expectStatus: 400,
    note: 'EZD-105: invalid email; 400 invalid_email (no money)',
  },
  ...(['GET', 'DELETE'] as const).map((method): MoneyRouteCase => ({
    file: `${API}settings/users/invites/[id]/route.ts`,
    method,
    load: () => import('../../src/app/api/settings/users/invites/[id]/route'),
    request: async () => {
      const id = randomUUID();
      return {
        request: new Request(`${BASE}/api/settings/users/invites/${id}`, { method }),
        params: { id },
      };
    },
    expectStatus: 404,
    note: 'EZD-105: unknown invite; 404 member_not_found (no money)',
  })),
  {
    file: `${API}settings/users/invites/[id]/resend/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/settings/users/invites/[id]/resend/route'),
    request: async () => {
      const id = randomUUID();
      return {
        request: new Request(`${BASE}/api/settings/users/invites/${id}/resend`, { method: 'POST' }),
        params: { id },
      };
    },
    expectStatus: 404,
    note: 'EZD-105: unknown invite; 404 member_not_found (no money)',
  },
  {
    file: `${API}settings/company/route.ts`,
    method: 'PATCH',
    load: () => import('../../src/app/api/settings/company/route'),
    request: sendJson('PATCH', '/api/settings/company', COMPANY),
    expectStatus: 200,
  },
  {
    file: `${API}settings/company/logo/check/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/settings/company/logo/check/route'),
    request: async (env) => {
      const path = logoPathFor(env.tenantId, 'png');
      const { error } = await adminDb()
        .storage.from('media')
        .upload(path, PNG_100, { contentType: 'image/png' });
      if (error) throw new Error(`upload failed: ${error.message}`);
      env.created.set('checkedLogoPath', path);
      return sendJson('POST', '/api/settings/company/logo/check', { path })();
    },
    expectStatus: 200,
  },
  {
    file: `${API}settings/company/logo/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/settings/company/logo/route'),
    request: async () => ({
      request: new Request(`${BASE}/api/settings/company/logo`, {
        method: 'POST',
        headers: { 'content-type': 'image/png' },
        body: PNG_100 as BodyInit,
      }),
    }),
    expectStatus: 200,
    after: (body, env) => env.created.set('logoPath', field(body, 'logo', 'path')),
  },
  {
    file: 'app/src/app/dev/captcha/stub/route.ts',
    method: 'GET',
    load: () => import('../../src/app/dev/captcha/stub/route'),
    request: get('/dev/captcha/stub'),
    expectStatus: 200,
  },
  {
    file: 'app/src/app/dev/cloud-check/read/route.ts',
    method: 'GET',
    load: () => import('../../src/app/dev/cloud-check/read/route'),
    request: async () => ({
      request: new Request('http://127.0.0.1:3000/dev/cloud-check/read', {
        headers: { 'x-forwarded-for': '198.51.100.7' },
      }),
    }),
    expectStatus: 200,
  },
  {
    file: 'app/src/app/dev/sw-offline/worker/route.ts',
    method: 'GET',
    load: () => import('../../src/app/dev/sw-offline/worker/route'),
    request: get('/dev/sw-offline/worker'),
    expectStatus: 200,
  },
  {
    file: `${API}profile/ai-key/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/profile/ai-key/route'),
    request: sendJson('POST', '/api/profile/ai-key', {
      key: 'sk-ant-api03-EZD5601MONEY' + randomUUID().replaceAll('-', ''),
    }),
    expectStatus: 200,
    note: 'EZD-5601: the built-in key-check recording answers 200, so the key is stored (E4)',
  },
  {
    file: `${API}profile/ai-key/route.ts`,
    method: 'DELETE',
    load: () => import('../../src/app/api/profile/ai-key/route'),
    request: async () => ({
      request: new Request(`${BASE}/api/profile/ai-key`, { method: 'DELETE' }),
    }),
    expectStatus: 200,
    note: 'EZD-5601: removes the key the case before stored (E4)',
  },
  // EZD-5602 E4 (vault/plans/EZD-5602.md section 4): after the DELETE above, so the money user has no key.
  {
    file: `${API}projects/[id]/assistant/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/projects/[id]/assistant/route'),
    request: async (env) => {
      const form = new FormData();
      form.append(
        'request',
        JSON.stringify({
          prompt: 'Add a door',
          history: [],
          model: 'sonnet',
          floorId: randomUUID(),
          selectedIds: [],
        }),
      );
      return {
        request: new Request(`${BASE}/api/projects/${env.projectId}/assistant`, {
          method: 'POST',
          body: form,
        }),
        params: { id: env.projectId },
      };
    },
    expectStatus: 400,
    note: 'no key; the 200 body is EZD-5602 T15',
  },
  {
    file: `${API}profile/password/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/profile/password/route'),
    request: async (env) => {
      const { randomPassword } = await import('../auth-users');
      const newPassword = await randomPassword(env.member.email);
      return sendJson('POST', '/api/profile/password', {
        mode: 'set',
        newPassword,
        confirmPassword: newPassword,
      })();
    },
    expectStatus: 200,
    note: 'set mode on a fresh session (EZD-108 T8); last, because it gives the member a password',
  },
  {
    file: `${API}projects/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/projects/route'),
    request: get('/api/projects'),
    expectStatus: 200,
    note: 'EZD-117a: one keyset page; items carry id, name, clientName, address, status, openItems (no money)',
  },
  {
    file: `${API}projects/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/projects/route'),
    request: sendJson('POST', '/api/projects', {
      name: 'Money case project',
      address: '1 Main St',
      type: 'kitchen',
      customerId: null,
      scopeOfWork: '',
    }),
    expectStatus: 201,
    note: 'EZD-118: creates one project; 201 { project: { id } } (no money)',
  },
  {
    file: `${API}projects/counts/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/projects/counts/route'),
    request: get('/api/projects/counts'),
    expectStatus: 200,
    note: 'EZD-117a: status tab counts only (no money)',
  },
  {
    file: `${API}projects/[id]/objects/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/projects/[id]/objects/route'),
    // EZD-202 E1: the saved object is a valid wall on the project's first floor.
    request: async (env) => {
      const floor = await adminDb()
        .from('model_object')
        .select('object_id')
        .eq('project_id', env.projectId)
        .eq('type', 'floor')
        .single();
      return {
        request: new Request(`${BASE}/api/projects/${env.projectId}/objects`, {
          method: 'POST',
          headers: {
            ...JSON_HEADERS,
            'x-ezdraft-membership': env.member.membershipId,
            // EZD-299a D-Order: a save names its app build; Vitest leaves the build at 0.
            'x-ezdraft-app-build': '0',
          },
          body: JSON.stringify({
            lockEpoch: 0,
            changes: [
              {
                id: randomUUID(),
                baseSeq: 0,
                deleted: false,
                type: 'wall',
                schemaVersion: 1,
                data: {
                  geometry: { start: { x: 0, y: 0 }, end: { x: 120, y: 0 } },
                  status: 'new',
                  level: floor.data?.object_id,
                  attributes: {
                    thickness: 4.5,
                    thicknessSide: 'right',
                    height: 96,
                    topCutToCeiling: false,
                    bearing: false,
                  },
                },
              },
            ],
          }),
        }),
        params: { id: env.projectId },
      };
    },
    expectStatus: 200,
    note: 'EZD-120a: saves one object; 200 { objects: [{ id, updatedSeq }] } (no money)',
  },
  {
    file: `${API}projects/[id]/checkpoints/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/projects/[id]/checkpoints/route'),
    request: async (env) => ({
      request: new Request(`${BASE}/api/projects/${env.projectId}/checkpoints`, {
        method: 'POST',
      }),
      params: { id: env.projectId },
    }),
    expectStatus: 201,
    after: (body, env) => env.created.set('thumbVersionId', field(body, 'version', 'id')),
    note: 'EZD-120a: one checkpoint; 201 { version: { id } } (no money)',
  },
  {
    file: `${API}projects/[id]/versions/[versionId]/thumbnail/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/projects/[id]/versions/[versionId]/thumbnail/route'),
    request: async (env) => {
      const versionId = made(env, 'thumbVersionId');
      return {
        request: new Request(
          `${BASE}/api/projects/${env.projectId}/versions/${versionId}/thumbnail`,
          { method: 'POST' },
        ),
        params: { id: env.projectId, versionId },
      };
    },
    expectStatus: 200,
    after: (body, env) => {
      env.created.set('thumbUpload', JSON.stringify((body as { upload: unknown }).upload));
      env.created.set('thumbPath', field(body, 'upload', 'path'));
    },
    note: 'EZD-224: signs one thumbnail upload; 200 { upload } (no money)',
  },
  {
    file: `${API}projects/[id]/versions/[versionId]/thumbnail/complete/route.ts`,
    method: 'POST',
    load: () =>
      import('../../src/app/api/projects/[id]/versions/[versionId]/thumbnail/complete/route'),
    request: async (env) => {
      const versionId = made(env, 'thumbVersionId');
      const upload = JSON.parse(made(env, 'thumbUpload')) as SignedUpload;
      await uploadFile(upload, new Blob([THUMB_WEBP]), { contentType: 'image/webp' });
      return {
        request: new Request(
          `${BASE}/api/projects/${env.projectId}/versions/${versionId}/thumbnail/complete`,
          { method: 'POST' },
        ),
        params: { id: env.projectId, versionId },
      };
    },
    expectStatus: 200,
    note: 'EZD-224: records the thumbnail; 200 { thumbnail: { versionId } } (no money)',
  },
  {
    file: `${API}projects/[id]/thumbnail/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/projects/[id]/thumbnail/route'),
    request: async (env) => ({
      request: new Request(`${BASE}/api/projects/${env.projectId}/thumbnail`),
      params: { id: env.projectId },
    }),
    expectStatus: 302,
    note: 'EZD-224: the card image; 302 to a signed link, empty body (no money)',
  },
  {
    file: `${API}projects/[id]/plan-scale/route.ts`,
    method: 'PUT',
    load: () => import('../../src/app/api/projects/[id]/plan-scale/route'),
    request: async (env) => ({
      request: new Request(`${BASE}/api/projects/${env.projectId}/plan-scale`, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ scale: 0.5 }),
      }),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-219: the plan scale; 200 { scale } (no money)',
  },
  {
    file: `${API}projects/[id]/model/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/projects/[id]/model/route'),
    request: async (env) => ({
      request: new Request(`${BASE}/api/projects/${env.projectId}/model`, { method: 'GET' }),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-120b: the project and its objects; 200 ModelLoad (no money)',
  },
  {
    file: `${API}benchmark/project/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/benchmark/project/route'),
    request: async () => ({
      request: new Request(`${BASE}/api/benchmark/project`, { method: 'POST' }),
    }),
    expectStatus: 201,
    note: 'EZD-236: makes the benchmark project; 201 { project: { id } } (no money)',
  },
  // EZD-299a section 4 T18 (vault/plans/EZD-299a.md): the sync conflict routes.
  {
    file: `${API}sync-conflicts/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/sync-conflicts/route'),
    request: get('/api/sync-conflicts'),
    expectStatus: 200,
    note: "EZD-299a: the caller's refused changes; 200 { items } (no money)",
  },
  {
    file: `${API}projects/[id]/sync-conflicts/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/projects/[id]/sync-conflicts/route'),
    request: async (env) => ({
      request: new Request(`${BASE}/api/projects/${env.projectId}/sync-conflicts`, {
        method: 'POST',
        headers: { ...JSON_HEADERS, 'x-ezdraft-membership': env.member.membershipId },
        body: JSON.stringify({
          changes: [
            {
              id: randomUUID(),
              baseSeq: 0,
              reason: 'conflict',
              deleted: false,
              type: 'wall',
              schemaVersion: 3,
              data: { attributes: { number: 4 } },
            },
          ],
        }),
      }),
      params: { id: env.projectId },
    }),
    expectStatus: 201,
    after: (body, env) => {
      const ids = (body as { ids?: unknown }).ids;
      if (!Array.isArray(ids) || typeof ids[0] !== 'string') {
        throw new Error('response has no ids[0] string');
      }
      env.created.set('syncConflictId', ids[0]);
    },
    note: 'EZD-299a: records one refused change; 201 { ids, notificationId } (no money)',
  },
  {
    file: `${API}sync-conflicts/[conflictId]/route.ts`,
    method: 'DELETE',
    load: () => import('../../src/app/api/sync-conflicts/[conflictId]/route'),
    request: async (env) => {
      const id = made(env, 'syncConflictId');
      return {
        request: new Request(`${BASE}/api/sync-conflicts/${id}`, { method: 'DELETE' }),
        params: { conflictId: id },
      };
    },
    expectStatus: 200,
    note: 'EZD-299a: removes that row; 200 { removed: true } (no money)',
  },
];

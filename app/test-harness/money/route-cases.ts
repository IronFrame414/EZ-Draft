// EZD-133 section 3 harness row `money/route-cases.ts` (vault/plans/EZD-133.md; C1, M1, M2): one case per
// exported method of every route, in the plan's order. Each request is the success request of that route's own
// route.test.ts unless the plan says otherwise; the status is the plan's (200 when not shown). `after` keeps the
// ids a later case needs in env.created. Test-only.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { adminDb, harnessSql, type Member } from '../rls/fixtures';
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
  // EZD-914: the status for a member without this switch, when the route refuses that member (supplier files are
  // cost files, so a member without See company costs gets 403 and no body to scan).
  expectStatusWithout?: { permission: string; status: number };
  after?: (body: unknown, env: CaseEnv) => void;
  note?: string;
};

/** The status a case expects for a member holding `granted`. */
export function expectedStatus(c: MoneyRouteCase, granted: readonly string[]): number {
  const w = c.expectStatusWithout;
  return w !== undefined && !granted.includes(w.permission) ? w.status : c.expectStatus;
}

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

// EZD-1201: the project's newest sent package (the share link the send case made).
async function latestSentPackage(
  env: CaseEnv,
): Promise<{ id: string; model_version_id: string; recipients: unknown }> {
  const { data, error } = await adminDb()
    .from('sent_package')
    .select('id, model_version_id, recipients')
    .eq('project_id', env.projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error || !data) throw new Error(`sent_package read failed: ${error?.code}`);
  return data as { id: string; model_version_id: string; recipients: unknown };
}

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
  // EZD-230: the user's own rail tool order.
  {
    file: `${API}profile/rail-order/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/profile/rail-order/route'),
    request: get('/api/profile/rail-order'),
    expectStatus: 200,
  },
  {
    file: `${API}profile/rail-order/route.ts`,
    method: 'PUT',
    load: () => import('../../src/app/api/profile/rail-order/route'),
    request: sendJson('PUT', '/api/profile/rail-order', { order: ['wall', 'select'] }),
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
  // EZD-301: the Upload step's routes. Start a PDF original, put its bytes, complete it, then start the import
  // with it. No money field in any answer (source_file view columns and ids only).
  {
    file: `${API}projects/[id]/source-files/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/projects/[id]/source-files/route'),
    request: async (env) => ({
      ...(await sendJson('POST', `/api/projects/${env.projectId}/source-files`, {
        kind: 'pdf',
        originalName: 'plan.pdf',
        contentType: 'application/pdf',
        size: 100,
      })()),
      params: { id: env.projectId },
    }),
    expectStatus: 201,
    after: (body, env) => {
      env.created.set('uploadStepFileId', field(body, 'sourceFile', 'id'));
      env.created.set('uploadStepPath', field(body, 'sourceFile', 'storagePath'));
    },
    note: 'EZD-301: source_file view and signed upload (no money)',
  },
  {
    file: `${API}source-files/[id]/complete/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/source-files/[id]/complete/route'),
    request: async (env) => {
      const id = made(env, 'uploadStepFileId');
      const { error } = await adminDb()
        .storage.from('sources')
        .upload(made(env, 'uploadStepPath'), new Uint8Array(100).fill(0x61), {
          contentType: 'application/pdf',
        });
      if (error) throw new Error(`upload failed: ${error.message}`);
      return {
        request: new Request(`${BASE}/api/source-files/${id}/complete`, { method: 'POST' }),
        params: { id },
      };
    },
    expectStatus: 200,
    note: 'EZD-301: source_file view (no money)',
  },
  {
    file: `${API}projects/[id]/imports/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/projects/[id]/imports/route'),
    request: async (env) => ({
      ...(await sendJson('POST', `/api/projects/${env.projectId}/imports`, {
        sourceFileIds: [made(env, 'uploadStepFileId')],
      })()),
      params: { id: env.projectId },
    }),
    expectStatus: 202,
    note: 'EZD-301: project id and source file ids (no money)',
  },
  // EZD-304: the scale of the PDF uploaded above (kind pdf, finished): the project's PDFs, then set and read its
  // scale. Answers are source_file ids, names, the calibration and a signed link (no money).
  {
    file: `${API}projects/[id]/source-files/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/projects/[id]/source-files/route'),
    request: async (env) => ({
      ...(await get(`/api/projects/${env.projectId}/source-files`)()),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-304: the project PDFs with their scale (no money)',
  },
  // EZD-914: the Supplier files panel. Supplier files are cost files, so a member without See company costs is refused
  // (403, no body). The answers are source_file ids, names, kinds, sizes, supplier name and email, and a signed
  // upload (no money). The complete case makes its own unfinished row and object, so it runs for both members.
  {
    file: `${API}projects/[id]/supplier-files/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/projects/[id]/supplier-files/route'),
    request: async (env) => ({
      ...(await get(`/api/projects/${env.projectId}/supplier-files`)()),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    expectStatusWithout: { permission: 'see_company_costs', status: 403 },
    note: 'EZD-914: the project supplier files (no money)',
  },
  {
    file: `${API}projects/[id]/supplier-files/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/projects/[id]/supplier-files/route'),
    request: async (env) => ({
      ...(await sendJson('POST', `/api/projects/${env.projectId}/supplier-files`, {
        kind: 'order_report',
        originalName: '2020_order_report.pdf',
        contentType: 'application/pdf',
        size: 100,
        supplierName: 'Cabinet Co',
        supplierContactEmail: 'orders@cabinet.example',
      })()),
      params: { id: env.projectId },
    }),
    expectStatus: 201,
    expectStatusWithout: { permission: 'see_company_costs', status: 403 },
    note: 'EZD-914: source_file view and signed upload (no money)',
  },
  {
    file: `${API}supplier-files/[id]/complete/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/supplier-files/[id]/complete/route'),
    request: async (env) => {
      const id = randomUUID();
      const path = `${env.tenantId}/${env.projectId}/${id}`;
      const row = await adminDb().from('source_file').insert({
        id,
        tenant_id: env.tenantId,
        project_id: env.projectId,
        kind: 'image',
        storage_path: path,
        original_name: '2020_persp_02.png',
        content_type: 'image/png',
        size_bytes: 100,
        uploaded_by: env.member.appUserId,
        supplier_name: 'Cabinet Co',
      });
      if (row.error) throw new Error(`insert failed: ${row.error.message}`);
      const { error } = await adminDb()
        .storage.from('sources')
        .upload(path, PNG_100, { contentType: 'image/png' });
      if (error) throw new Error(`upload failed: ${error.message}`);
      env.created.set('supplierCompletePath', path);
      return {
        request: new Request(`${BASE}/api/supplier-files/${id}/complete`, { method: 'POST' }),
        params: { id },
      };
    },
    expectStatus: 200,
    note: 'EZD-914: source_file view (no money)',
  },
  {
    file: `${API}source-files/[id]/scale/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/source-files/[id]/scale/route'),
    request: async (env) => {
      const id = made(env, 'uploadStepFileId');
      return {
        ...(await sendJson('POST', `/api/source-files/${id}/scale`, {
          scaleCalibration: { page: 1, a: [504, 300], b: [720, 300], lengthIn: 144 },
        })()),
        params: { id },
      };
    },
    expectStatus: 200,
    note: 'EZD-304: the PDF scale (no money)',
  },
  {
    file: `${API}source-files/[id]/scale/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/source-files/[id]/scale/route'),
    request: async (env) => {
      const id = made(env, 'uploadStepFileId');
      return { request: new Request(`${BASE}/api/source-files/${id}/scale`), params: { id } };
    },
    expectStatus: 200,
    note: 'EZD-304: the PDF scale and a signed link (no money)',
  },
  // EZD-220: the thumbnail link of an uploaded pin photo (kind photo). The row and object are made here; the answer
  // is the signed link only.
  {
    file: `${API}source-files/[id]/link/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/source-files/[id]/link/route'),
    request: async (env) => {
      const fileId = randomUUID();
      const storagePath = `${env.tenantId}/${env.projectId}/${fileId}`;
      const { error: rowError } = await adminDb().from('source_file').insert({
        id: fileId,
        tenant_id: env.tenantId,
        project_id: env.projectId,
        kind: 'photo',
        storage_path: storagePath,
        original_name: 'stain.png',
        content_type: 'image/png',
        size_bytes: PNG_100.length,
        uploaded_at: new Date().toISOString(),
      });
      if (rowError) throw new Error(`source_file insert failed: ${rowError.message}`);
      const { error } = await adminDb()
        .storage.from('sources')
        .upload(storagePath, PNG_100, { contentType: 'image/png' });
      if (error) throw new Error(`upload failed: ${error.message}`);
      return {
        request: new Request(`${BASE}/api/source-files/${fileId}/link`),
        params: { id: fileId },
      };
    },
    expectStatus: 200,
    note: 'EZD-220: a signed photo link (no money)',
  },
  // EZD-306: the layers of an uploaded DXF drawing (kind dxf). The row and object are made here; the answer is
  // layer names only.
  {
    file: `${API}projects/[id]/source-files/[fileId]/layers/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/projects/[id]/source-files/[fileId]/layers/route'),
    request: async (env) => {
      const fileId = randomUUID();
      const storagePath = `${env.tenantId}/${env.projectId}/${fileId}`;
      const dxf = new TextEncoder().encode('0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nWALLS\n0\nENDSEC\n0\nEOF\n');
      const { error: rowError } = await adminDb().from('source_file').insert({
        id: fileId,
        tenant_id: env.tenantId,
        project_id: env.projectId,
        kind: 'dxf',
        storage_path: storagePath,
        original_name: 'plan.dxf',
        content_type: 'image/vnd.dxf',
        size_bytes: dxf.length,
        uploaded_at: new Date().toISOString(),
      });
      if (rowError) throw new Error(`source_file insert failed: ${rowError.message}`);
      const { error } = await adminDb()
        .storage.from('sources')
        .upload(storagePath, dxf, { contentType: 'image/vnd.dxf' });
      if (error) throw new Error(`upload failed: ${error.message}`);
      return {
        request: new Request(
          `${BASE}/api/projects/${env.projectId}/source-files/${fileId}/layers`,
        ),
        params: { id: env.projectId, fileId },
      };
    },
    expectStatus: 200,
    note: 'EZD-306: layer names of a DXF drawing (no money)',
  },
  {
    file: `${API}projects/[id]/imports/[jobId]/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/projects/[id]/imports/[jobId]/route'),
    request: async (env) => {
      const jobId = made(env, 'jobId');
      return {
        request: new Request(`${BASE}/api/projects/${env.projectId}/imports/${jobId}`),
        params: { id: env.projectId, jobId },
      };
    },
    expectStatus: 404,
    note: 'EZD-307: the made job is not an import, so not found; a review holds detected items and file names (no money)',
  },
  {
    file: `${API}projects/[id]/imports/[jobId]/route.ts`,
    method: 'PATCH',
    load: () => import('../../src/app/api/projects/[id]/imports/[jobId]/route'),
    request: async (env) => {
      const jobId = made(env, 'jobId');
      return {
        ...(await sendJson('PATCH', `/api/projects/${env.projectId}/imports/${jobId}`, {
          mode: 'by_room',
          changes: [{ item_id: 'w1', decision: 'accepted', fix: null }],
        })()),
        params: { id: env.projectId, jobId },
      };
    },
    expectStatus: 404,
    note: 'EZD-309: the made job is not an import, so not found; review changes hold decisions and geometry (no money)',
  },
  {
    file: `${API}projects/[id]/imports/[jobId]/finish/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/projects/[id]/imports/[jobId]/finish/route'),
    request: async (env) => {
      const jobId = made(env, 'jobId');
      return {
        ...(await sendJson('POST', `/api/projects/${env.projectId}/imports/${jobId}/finish`, {})()),
        params: { id: env.projectId, jobId },
      };
    },
    expectStatus: 404,
    note: 'EZD-313: the made job is not an import, so not found; Finish answers a version id and counts (no money)',
  },
  {
    file: `${API}projects/[id]/imports/[jobId]/cancel/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/projects/[id]/imports/[jobId]/cancel/route'),
    request: async (env) => {
      const jobId = made(env, 'jobId');
      return {
        ...(await sendJson('POST', `/api/projects/${env.projectId}/imports/${jobId}/cancel`, {})()),
        params: { id: env.projectId, jobId },
      };
    },
    expectStatus: 404,
    note: 'EZD-313: the made job is not an import, so not found; Cancel answers a status (no money)',
  },
  {
    file: `${API}projects/[id]/imports/[jobId]/retry/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/projects/[id]/imports/[jobId]/retry/route'),
    request: async (env) => {
      const jobId = made(env, 'jobId');
      return {
        ...(await sendJson('POST', `/api/projects/${env.projectId}/imports/${jobId}/retry`, {})()),
        params: { id: env.projectId, jobId },
      };
    },
    expectStatus: 404,
    note: 'EZD-314: the made job is not an import, so not found; Retry answers a status (no money)',
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
  // EZD-401: the read-only catalog picker list (no money fields).
  {
    file: `${API}catalog/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/catalog/route'),
    request: get('/api/catalog'),
    expectStatus: 200,
    note: 'EZD-401: the company catalog; 200 { items } (no money)',
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
  // EZD-712: Settings > Sheet presets. The case company has no profile, so POST makes its first one, the
  // default; PATCH renames it; DELETE of the default is refused (409 profile_is_default).
  {
    file: `${API}settings/sheet-presets/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/settings/sheet-presets/route'),
    request: get('/api/settings/sheet-presets'),
    expectStatus: 200,
    note: 'EZD-712: the company submittal profiles; 200 { profiles } (no money)',
  },
  {
    file: `${API}settings/sheet-presets/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/settings/sheet-presets/route'),
    request: sendJson('POST', '/api/settings/sheet-presets', { department: 'Palm Beach County' }),
    expectStatus: 201,
    after: (body, env) => env.created.set('submittalProfileId', field(body, 'profile', 'id')),
    note: 'EZD-712: New profile; 201 { profile } (no money)',
  },
  {
    file: `${API}settings/sheet-presets/[id]/route.ts`,
    method: 'PATCH',
    load: () => import('../../src/app/api/settings/sheet-presets/[id]/route'),
    request: async (env) => {
      const id = made(env, 'submittalProfileId');
      return {
        ...(await sendJson('PATCH', `/api/settings/sheet-presets/${id}`, {
          fields: { department: 'Palm Beach County Building' },
        })()),
        params: { id },
      };
    },
    expectStatus: 200,
    note: 'EZD-712: the inspector Save; 200 { profile } (no money)',
  },
  {
    file: `${API}settings/sheet-presets/[id]/route.ts`,
    method: 'DELETE',
    load: () => import('../../src/app/api/settings/sheet-presets/[id]/route'),
    request: async (env) => {
      const id = made(env, 'submittalProfileId');
      return {
        request: new Request(`${BASE}/api/settings/sheet-presets/${id}`, { method: 'DELETE' }),
        params: { id },
      };
    },
    expectStatus: 409,
    note: 'EZD-712: the default cannot be deleted; 409 profile_is_default (no money)',
  },
  // EZD-712: the project's submittal profile in Project settings. The case company has its first profile from the
  // sheet-presets POST above.
  {
    file: `${API}projects/[id]/submittal-profile/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/projects/[id]/submittal-profile/route'),
    request: async (env) => ({
      ...(await get(`/api/projects/${env.projectId}/submittal-profile`)()),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-712: the project profile and the choices; 200 { profileId, profiles, canManage } (no money)',
  },
  {
    file: `${API}projects/[id]/submittal-profile/route.ts`,
    method: 'PATCH',
    load: () => import('../../src/app/api/projects/[id]/submittal-profile/route'),
    request: async (env) => ({
      ...(await sendJson('PATCH', `/api/projects/${env.projectId}/submittal-profile`, {
        profileId: made(env, 'submittalProfileId'),
      })()),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-712: Project settings picks the profile; 200 { profileId } (no money)',
  },
  // EZD-726: the set selector query (the project's permit and client sets with their sheets).
  {
    file: `${API}projects/[id]/sheet-sets/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/projects/[id]/sheet-sets/route'),
    request: async (env) => ({
      ...(await get(`/api/projects/${env.projectId}/sheet-sets`)()),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-726: the sets and their sheets; 200 { sets } (no money)',
  },
  // EZD-714: the notes the project's set prints (general notes for its type and its profile's required notes).
  {
    file: `${API}projects/[id]/notes/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/projects/[id]/notes/route'),
    request: async (env) => ({
      ...(await get(`/api/projects/${env.projectId}/notes`)()),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-714: the set notes; 200 { general, required } (no money)',
  },
  // EZD-1404: the phone field pack; a project with no issue answers pack null.
  {
    file: `${API}projects/[id]/field-pack/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/projects/[id]/field-pack/route'),
    request: async (env) => ({
      ...(await get(`/api/projects/${env.projectId}/field-pack`)()),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-1404: the field pack; 200 { projectName, clientName, pack } (no money)',
  },
  // EZD-1415: Field measure rooms; GET reads them (a new project: the Building alone), PUT saves an L-shaped room.
  {
    file: `${API}projects/[id]/field-measure/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/projects/[id]/field-measure/route'),
    request: async (env) => ({
      ...(await get(`/api/projects/${env.projectId}/field-measure`)()),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-1415: the field measure rooms; 200 { rooms } (no money)',
  },
  {
    file: `${API}projects/[id]/field-measure/route.ts`,
    method: 'PUT',
    load: () => import('../../src/app/api/projects/[id]/field-measure/route'),
    request: async (env) => ({
      ...(await sendJson('PUT', `/api/projects/${env.projectId}/field-measure`, {
        rooms: [
          {
            id: 'building',
            kind: 'building',
            name: 'Building',
            shape: 'l',
            corners: [],
            closed: true,
            lengths: [null, null, null, null, null, null],
            ceiling: null,
          },
        ],
      })()),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-1415: saves the field measure rooms; 200 { status } (no money)',
  },
  // EZD-1419: the office reopens sent field measure rooms; nothing sent yet answers not_sent.
  {
    file: `${API}projects/[id]/field-measure/reopen/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/projects/[id]/field-measure/reopen/route'),
    request: async (env) => ({
      ...(await sendJson('POST', `/api/projects/${env.projectId}/field-measure/reopen`, {})()),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-1419: reopens sent field measure rooms; 200 { status } (no money)',
  },
  // EZD-1402: the field action routes; the photo start signs an upload, the record takes a measurement.
  {
    file: `${API}projects/[id]/field-actions/photo/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/projects/[id]/field-actions/photo/route'),
    request: async (env) => ({
      request: new Request(`${BASE}/api/projects/${env.projectId}/field-actions/photo`, {
        method: 'POST',
        headers: { ...JSON_HEADERS, 'x-ezdraft-membership': env.member.membershipId },
        body: JSON.stringify({ id: randomUUID(), kind: 'photo_pin', photo: 'jpg' }),
      }),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-1402: signs a field photo upload; 200 { upload } (no money)',
  },
  {
    file: `${API}projects/[id]/field-actions/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/projects/[id]/field-actions/route'),
    request: async (env) => ({
      request: new Request(`${BASE}/api/projects/${env.projectId}/field-actions`, {
        method: 'POST',
        headers: { ...JSON_HEADERS, 'x-ezdraft-membership': env.member.membershipId },
        body: JSON.stringify({
          id: randomUUID(),
          deviceId: randomUUID(),
          kind: 'measurement',
          ops: { value: 144 },
          baseVersionId: null,
          queuedAt: Date.now(),
          photo: null,
        }),
      }),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-1402: records a queued field action; 200 { status, syncedAt } (no money)',
  },
  // EZD-233: the Plan editor's saved groups; POST saves one lavatory as a group.
  {
    file: `${API}saved-groups/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/saved-groups/route'),
    request: get('/api/saved-groups'),
    expectStatus: 200,
    note: 'EZD-233: the company saved groups with their objects; 200 { groups } (no money)',
  },
  {
    file: `${API}saved-groups/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/saved-groups/route'),
    request: sendJson('POST', '/api/saved-groups', {
      name: 'Vanity set',
      data: {
        items: [
          {
            id: randomUUID(),
            type: 'fixture',
            schemaVersion: 5,
            data: {
              geometry: { center: { x: 10, y: 50 }, axis: { x: 1, y: 0 } },
              status: 'new',
              level: randomUUID(),
              attributes: { kind: 'lavatory', width: 20, depth: 18 },
            },
          },
        ],
      },
    }),
    expectStatus: 201,
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
  // EZD-105b: the Owner-set password, aimed at a membership id no company has, so no password changes.
  {
    file: `${API}settings/users/[id]/password/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/settings/users/[id]/password/route'),
    request: async () => {
      const id = randomUUID();
      return {
        request: new Request(`${BASE}/api/settings/users/${id}/password`, { method: 'POST' }),
        params: { id },
      };
    },
    expectStatus: 403,
    note: 'EZD-105b: the harness member has no Owner preset; 403 permission_denied (no money)',
  },
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
    file: `${API}settings/defaults/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/settings/defaults/route'),
    request: get('/api/settings/defaults'),
    expectStatus: 200,
    note: 'EZD-116: the company defaults; 200 { stored, effective } (no money, Q-0697 10)',
  },
  {
    file: `${API}settings/defaults/route.ts`,
    method: 'PATCH',
    load: () => import('../../src/app/api/settings/defaults/route'),
    request: sendJson('PATCH', '/api/settings/defaults', { changes: { waste_tile: 10 } }),
    expectStatus: 200,
    note: 'EZD-116: save the company defaults; 200 { stored, effective } (no money, Q-0697 10)',
  },
  {
    file: `${API}settings/code-edition/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/settings/code-edition/route'),
    request: get('/api/settings/code-edition'),
    expectStatus: 200,
    note: 'EZD-613: the company code edition; 200 { edition, optionalLoadCalc, available } (no money)',
  },
  {
    file: `${API}settings/code-edition/route.ts`,
    method: 'PATCH',
    load: () => import('../../src/app/api/settings/code-edition/route'),
    request: sendJson('PATCH', '/api/settings/code-edition', { optionalLoadCalc: true }),
    expectStatus: 200,
    note: 'EZD-613: save the company code edition; 200 { edition, optionalLoadCalc, available } (no money)',
  },
  {
    file: `${API}settings/title-block/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/settings/title-block/route'),
    request: get('/api/settings/title-block'),
    expectStatus: 200,
    note: 'EZD-709: the company title block; 200 { config, company, codeEdition } (no money)',
  },
  {
    file: `${API}settings/title-block/route.ts`,
    method: 'PATCH',
    load: () => import('../../src/app/api/settings/title-block/route'),
    request: sendJson('PATCH', '/api/settings/title-block', { showCompany: false }),
    expectStatus: 200,
    note: 'EZD-709: save the company-block switch; 200 { showCompany } (no money)',
  },
  {
    file: `${API}settings/render-models/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/settings/render-models/route'),
    request: get('/api/settings/render-models'),
    expectStatus: 200,
    note: 'EZD-1102: tiers and models; cost per render and allowance only with See company costs',
  },
  {
    file: `${API}settings/render-models/route.ts`,
    method: 'PATCH',
    load: () => import('../../src/app/api/settings/render-models/route'),
    request: sendJson('PATCH', '/api/settings/render-models', {
      tiers: [
        { tier: 'fast', model: 'gemini-3.1-flash-lite-image-1k' },
        { tier: 'standard', model: 'gemini-3.1-flash-image-1k' },
        { tier: 'photoreal', model: 'gemini-3.1-flash-image-4k' },
      ],
    }),
    expectStatus: 200,
    note: 'EZD-1102: save the tier models (no dollars sent); 200 as GET, dollars only with See company costs',
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
    file: `${API}projects/recent/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/projects/recent/route'),
    request: get('/api/projects/recent'),
    expectStatus: 200,
    note: 'EZD-128: recent project names and clients only (no money)',
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
  // EZD-111: after the thumbnail cases, whose version must stay the newest.
  {
    file: `${API}projects/[id]/send-recipient/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/projects/[id]/send-recipient/route'),
    request: async (env) => ({
      request: new Request(`${BASE}/api/projects/${env.projectId}/send-recipient`),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-111: the project client; 200 { recipient } (no money)',
  },
  {
    file: `${API}projects/[id]/sends/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/projects/[id]/sends/route'),
    request: async (env) => {
      const { data, error } = await adminDb()
        .from('customer')
        .insert({
          tenant_id: env.tenantId,
          name: 'Zed Co',
          email: `zedco-${randomUUID().slice(0, 8)}@example.test`,
        })
        .select('id')
        .single();
      if (error || !data) throw new Error(`customer insert failed: ${error?.code}`);
      const set = await adminDb()
        .from('project')
        .update({ customer_id: (data as { id: string }).id })
        .eq('id', env.projectId);
      if (set.error) throw new Error(`project update failed: ${set.error.code}`);
      return {
        request: new Request(`${BASE}/api/projects/${env.projectId}/sends`, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ note: null }),
        }),
        params: { id: env.projectId },
      };
    },
    expectStatus: 201,
    note: 'EZD-111: one send; 201 { send } (no money)',
  },
  // EZD-1201: the share link routes, on the link the send case made. resolve runs on a second row of the same
  // send with a fresh token this case knows (the send's token is only in its email). No money field in any answer.
  {
    file: `${API}share-links/resolve/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/share-links/resolve/route'),
    request: async (env) => {
      const sent = await latestSentPackage(env);
      const token = randomBytes(32).toString('base64url');
      const { error } = await adminDb()
        .from('sent_package')
        .insert({
          tenant_id: env.tenantId,
          project_id: env.projectId,
          model_version_id: sent.model_version_id,
          kind: 'client',
          recipients: sent.recipients,
          token_hash: createHash('sha256').update(token).digest('hex'),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
      if (error) throw new Error(`sent_package insert failed: ${error.code}`);
      return sendJson('POST', '/api/share-links/resolve', { token })();
    },
    expectStatus: 200,
    note: 'EZD-1201: an active link; 200 { link: { status, expiresAt } } (no money)',
  },
  {
    file: `${API}share-links/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/share-links/route'),
    request: async (env) => get(`/api/share-links?projectId=${env.projectId}`)(),
    expectStatus: 200,
    note: 'EZD-1201: the Share panel list; 200 { links } (no money)',
  },
  {
    file: `${API}share-links/[id]/renew/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/share-links/[id]/renew/route'),
    request: async (env) => {
      const { id } = await latestSentPackage(env);
      return {
        request: new Request(`${BASE}/api/share-links/${id}/renew`, { method: 'POST' }),
        params: { id },
      };
    },
    expectStatus: 200,
    note: 'EZD-1201: Renew; 200 { link } (no money)',
  },
  {
    file: `${API}share-links/[id]/revoke/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/share-links/[id]/revoke/route'),
    request: async (env) => {
      const { id } = await latestSentPackage(env);
      return {
        request: new Request(`${BASE}/api/share-links/${id}/revoke`, { method: 'POST' }),
        params: { id },
      };
    },
    expectStatus: 200,
    note: 'EZD-1201: Turn off; 200 { link } (no money)',
  },
  // EZD-417: the edge profile library and Edit offered edges. The PUT offers the company's first profile on a top
  // with a rate; the GET reads it back. ratePerLf only with See sell prices.
  {
    file: `${API}edge-profiles/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/edge-profiles/route'),
    request: get('/api/edge-profiles'),
    expectStatus: 200,
    note: 'EZD-417: the library; 200 { profiles } (no price is stored on a profile)',
  },
  {
    file: `${API}projects/[id]/edge-offer/route.ts`,
    method: 'PUT',
    load: () => import('../../src/app/api/projects/[id]/edge-offer/route'),
    request: async (env) => {
      await harnessSql()`select private.seed_edge_profiles(${env.tenantId}::uuid)`;
      const { data, error } = await adminDb()
        .from('edge_profile')
        .select('id')
        .eq('tenant_id', env.tenantId)
        .order('position')
        .limit(1)
        .single();
      if (error || !data) throw new Error(`edge_profile read failed: ${error?.code}`);
      return {
        request: new Request(`${BASE}/api/projects/${env.projectId}/edge-offer`, {
          method: 'PUT',
          headers: JSON_HEADERS,
          body: JSON.stringify({ pieceId: randomUUID(), choices: [{ profileId: data.id, ratePerLf: 12 }] }),
        }),
        params: { id: env.projectId },
      };
    },
    expectStatus: 200,
    note: 'EZD-417: Edit offered edges; 200 { offer } (ratePerLf only with See sell prices)',
  },
  {
    file: `${API}projects/[id]/edge-offer/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/projects/[id]/edge-offer/route'),
    request: async (env) => ({
      request: new Request(`${BASE}/api/projects/${env.projectId}/edge-offer`),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-417: the offers; 200 { offers } (ratePerLf only with See sell prices)',
  },
  // EZD-122: the Versions panel routes, after the send so the thumbnail cases' version stays the newest.
  {
    file: `${API}projects/[id]/versions/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/projects/[id]/versions/route'),
    request: async (env) => ({
      request: new Request(`${BASE}/api/projects/${env.projectId}/versions`),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-122: the version list; 200 { versions } (no money)',
  },
  {
    file: `${API}projects/[id]/versions/[versionId]/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/projects/[id]/versions/[versionId]/route'),
    request: async (env) => {
      const versionId = made(env, 'thumbVersionId');
      return {
        request: new Request(`${BASE}/api/projects/${env.projectId}/versions/${versionId}`),
        params: { id: env.projectId, versionId },
      };
    },
    expectStatus: 200,
    note: 'EZD-122: one version read-only; 200 { version, invalid } (no money)',
  },
  {
    file: `${API}projects/[id]/versions/[versionId]/snapshot/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/projects/[id]/versions/[versionId]/snapshot/route'),
    request: async (env) => {
      const versionId = made(env, 'thumbVersionId');
      return {
        request: new Request(
          `${BASE}/api/projects/${env.projectId}/versions/${versionId}/snapshot`,
          { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ name: 'Kept' }) },
        ),
        params: { id: env.projectId, versionId },
      };
    },
    expectStatus: 200,
    note: 'EZD-122: Name snapshot; 200 { version: { id, label } } (no money)',
  },
  {
    file: `${API}projects/[id]/versions/[versionId]/revert/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/projects/[id]/versions/[versionId]/revert/route'),
    request: async (env) => {
      const versionId = made(env, 'thumbVersionId');
      return {
        request: new Request(
          `${BASE}/api/projects/${env.projectId}/versions/${versionId}/revert`,
          { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ lockEpoch: 0, label: 'Kept' }) },
        ),
        params: { id: env.projectId, versionId },
      };
    },
    expectStatus: 200,
    note: 'EZD-122: Revert with no holder at generation 0 (as a save); 200 { version: { id } } (no money)',
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
    file: `${API}projects/[id]/phase-default/route.ts`,
    method: 'PUT',
    load: () => import('../../src/app/api/projects/[id]/phase-default/route'),
    request: async (env) => ({
      request: new Request(`${BASE}/api/projects/${env.projectId}/phase-default`, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ phase: 'existing' }),
      }),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-214: the phase view; 200 { phase } (no money)',
  },
  {
    file: `${API}projects/[id]/property-record/route.ts`,
    method: 'PUT',
    load: () => import('../../src/app/api/projects/[id]/property-record/route'),
    request: async (env) => ({
      request: new Request(`${BASE}/api/projects/${env.projectId}/property-record`, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          fields: { parcelNo: null, owner: 'Money case', legalDescription: null, yearBuilt: 1975, livingArea: null },
          sourceUrl: null,
        }),
      }),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-711: the property appraiser import save; 200 { record } (no money)',
  },
  {
    file: `${API}projects/[id]/property-record/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/projects/[id]/property-record/route'),
    request: async (env) => ({
      request: new Request(`${BASE}/api/projects/${env.projectId}/property-record`),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-711: the project property record; 200 { record } (no money)',
  },
  {
    file: `${API}property-records/read/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/property-records/read/route'),
    request: async (env) => ({
      request: new Request(`${BASE}/api/property-records/read`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ projectId: env.projectId, url: 'https://example.com/parcel' }),
      }),
    }),
    expectStatus: 200,
    note: 'EZD-711: a link the server may not fetch answers unreadable with no job; 200 { output } (no money)',
  },
  {
    file: `${API}projects/[id]/defaults/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/projects/[id]/defaults/route'),
    request: async (env) => ({
      request: new Request(`${BASE}/api/projects/${env.projectId}/defaults`, { method: 'GET' }),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-116: the project effective defaults; 200 { defaults } (no money)',
  },
  {
    file: `${API}projects/[id]/settings/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/projects/[id]/settings/route'),
    request: async (env) => ({
      request: new Request(`${BASE}/api/projects/${env.projectId}/settings`, { method: 'GET' }),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-130: Project settings; 200 ProjectSettings (no money)',
  },
  {
    file: `${API}projects/[id]/settings/route.ts`,
    method: 'PATCH',
    load: () => import('../../src/app/api/projects/[id]/settings/route'),
    request: async (env) => ({
      request: new Request(`${BASE}/api/projects/${env.projectId}/settings`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ scopeOfWork: 'Money route case' }),
      }),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-130: Project settings save; 200 ProjectSettings (no money)',
  },
  {
    file: `${API}projects/[id]/route.ts`,
    method: 'PATCH',
    load: () => import('../../src/app/api/projects/[id]/route'),
    request: async (env) => ({
      request: new Request(`${BASE}/api/projects/${env.projectId}`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ status: 'draft' }),
      }),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-124: the card menu Rename, Set status, Archive, Restore; 200 { changed } (no money)',
  },
  {
    file: `${API}projects/[id]/delete/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/projects/[id]/delete/route'),
    request: async (env) => {
      // Its own project, so the shared one stays for the other cases.
      const { data, error } = await adminDb()
        .from('project')
        .insert({ tenant_id: env.tenantId, name: 'Money delete case', address: '1 Money St', type: 'kitchen' })
        .select('id')
        .single();
      if (error || !data) throw new Error(`money delete case project: ${error?.message}`);
      const id = (data as { id: string }).id;
      return {
        request: new Request(`${BASE}/api/projects/${id}/delete`, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ confirmName: 'Money delete case' }),
        }),
        params: { id },
      };
    },
    expectStatus: 200,
    note: 'EZD-124: Delete a project; 200 { deleted: true } (no money)',
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
    file: `${API}projects/[id]/people/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/projects/[id]/people/route'),
    request: async (env) => ({
      request: new Request(
        `${BASE}/api/projects/${env.projectId}/people?ids=${env.member.appUserId}`,
        { method: 'GET' },
      ),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-126: names and initials of people in the project; 200 { people } (no money)',
  },
  {
    file: `${API}projects/[id]/review/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/projects/[id]/review/route'),
    request: async (env) => ({
      request: new Request(`${BASE}/api/projects/${env.projectId}/review?list=1`, { method: 'GET' }),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-127: the review count and source groups; 200 { count, groups } (no money)',
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
  // EZD-237 section 4 T24 (vault/plans/EZD-237.md): the benchmark run routes.
  {
    file: `${API}benchmark/runs/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/benchmark/runs/route'),
    request: get('/api/benchmark/runs'),
    expectStatus: 200,
    note: 'EZD-237: benchmark runs (no money)',
  },
  {
    file: `${API}benchmark/runs/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/benchmark/runs/route'),
    request: sendJson('POST', '/api/benchmark/runs', {
      device: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/131.0.0.0 Safari/537.36',
        screen: { width: 1600, height: 1000 },
        devicePixelRatio: 1,
        hardwareConcurrency: 8,
        maxTouchPoints: 0,
      },
      appVersion: 'dev-1730000000',
      results: {
        pan: { frames: 180, meanMs: 6, p95Ms: 12, maxMs: 40, over100: 0 },
        zoom: { frames: 180, meanMs: 6, p95Ms: 12, maxMs: 40, over100: 0 },
        drag: { frames: 180, meanMs: 6, p95Ms: 12, maxMs: 40, over100: 0 },
        memory: null,
      },
    }),
    expectStatus: 201,
    note: 'EZD-237: benchmark runs (no money)',
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
  // EZD-125 (Q-0697): the edit lock routes, last, so no earlier case's save at epoch 0 meets a held lock.
  {
    file: `${API}projects/[id]/lock/route.ts`,
    method: 'GET',
    load: () => import('../../src/app/api/projects/[id]/lock/route'),
    request: async (env) => ({
      request: new Request(`${BASE}/api/projects/${env.projectId}/lock`),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-125: the lock read; 200 { lock } (holder id and name, no money)',
  },
  {
    file: `${API}projects/[id]/lock/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/projects/[id]/lock/route'),
    request: async (env) => ({
      request: new Request(`${BASE}/api/projects/${env.projectId}/lock`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ deviceId: 'money-case' }),
      }),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-125: Start editing; 200 { lock: { lockEpoch, since } } (no money)',
  },
  {
    file: `${API}projects/[id]/lock/request/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/projects/[id]/lock/request/route'),
    request: async (env) => ({
      request: new Request(`${BASE}/api/projects/${env.projectId}/lock/request`, {
        method: 'POST',
      }),
      params: { id: env.projectId },
    }),
    expectStatus: 409,
    note: 'EZD-125: the holder asking to edit; 409 own_lock (no money)',
  },
  {
    file: `${API}projects/[id]/lock/request/route.ts`,
    method: 'DELETE',
    load: () => import('../../src/app/api/projects/[id]/lock/request/route'),
    request: async (env) => ({
      request: new Request(`${BASE}/api/projects/${env.projectId}/lock/request`, {
        method: 'DELETE',
      }),
      params: { id: env.projectId },
    }),
    expectStatus: 404,
    note: 'EZD-125: Cancel with no pending request; 404 request_not_found (no money)',
  },
  {
    file: `${API}projects/[id]/lock/respond/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/projects/[id]/lock/respond/route'),
    request: async (env) => ({
      request: new Request(`${BASE}/api/projects/${env.projectId}/lock/respond`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          requestId: '00000000-0000-4000-8000-000000000000',
          response: 'keep',
        }),
      }),
      params: { id: env.projectId },
    }),
    expectStatus: 409,
    note: 'EZD-125: Keep for a request that is not pending; 409 request_not_pending (no money)',
  },
  {
    file: `${API}projects/[id]/lock/release/route.ts`,
    method: 'POST',
    load: () => import('../../src/app/api/projects/[id]/lock/release/route'),
    request: async (env) => ({
      request: new Request(`${BASE}/api/projects/${env.projectId}/lock/release`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ reason: 'stop_editing' }),
      }),
      params: { id: env.projectId },
    }),
    expectStatus: 200,
    note: 'EZD-125: Stop editing; 200 { lock: { lockEpoch } } (no money)',
  },
];

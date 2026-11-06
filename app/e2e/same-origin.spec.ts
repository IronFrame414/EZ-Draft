// EZD-346 B1, B2 (vault/plans/EZD-346.md section 4; AC-EZD-346-1, AC-EZD-346-2; Q-0599). Untagged, so desktop.
// Every test makes its own company (never tenant 1) with fixture S and one member (view_projects, edit_model).
// B1: cross-site and sibling-subdomain POSTs sent by the API request context are refused and write nothing.
// B2: the same POSTs made by the app's own page succeed. Expected values: plan section 4 rows.
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { appOriginHeaders } from '../test-harness/e2e/same-origin';
import { seedFixtureS } from '../test-harness/projects-fixture';

const CROSS = { 'sec-fetch-site': 'cross-site', origin: 'https://attacker.example' };
const SIBLING = { 'sec-fetch-site': 'same-site', origin: 'https://other.ezcontractorbinder.com' };
const REFUSED = { error: { code: 'cross_origin_refused', message_key: 'error.not_authorized' } };
const RENAMED = 'EZD-346 renamed';

async function setup() {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const m = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, m.membershipId, ['view_projects', 'edit_model'] as never);
  return { tenant, ids, m };
}

async function versionCount(projectId: string): Promise<number> {
  const { count, error } = await adminDb()
    .from('model_version')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);
  if (error) throw new Error(`model_version count failed: ${error.code}`);
  return count ?? 0;
}

async function floorRow(projectId: string) {
  const { data, error } = await adminDb()
    .from('model_object')
    .select('object_id, updated_seq, schema_version, data')
    .eq('project_id', projectId)
    .eq('type', 'floor')
    .single();
  if (error) throw new Error(`model_object read failed: ${error.code}`);
  return data as {
    object_id: string;
    updated_seq: number;
    schema_version: number;
    data: Record<string, unknown>;
  };
}

async function lockEpoch(projectId: string): Promise<number> {
  const { data, error } = await adminDb()
    .from('edit_lock')
    .select('lock_epoch')
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) throw new Error(`edit_lock read failed: ${error.code}`);
  return data === null ? 0 : Number(data.lock_epoch);
}

async function readAt(tenantId: string): Promise<unknown[]> {
  const { data, error } = await adminDb()
    .from('notification')
    .select('read_at')
    .eq('tenant_id', tenantId);
  if (error) throw new Error(`notification read failed: ${error.code}`);
  return (data ?? []).map((r) => r.read_at);
}

async function renameChange(projectId: string) {
  const floor = await floorRow(projectId);
  return {
    id: floor.object_id,
    baseSeq: floor.updated_seq,
    deleted: false,
    type: 'floor',
    schemaVersion: floor.schema_version,
    data: { ...floor.data, name: RENAMED },
  };
}

test.describe('EZD-346 same-origin writes in the browser', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-346 B1 forged POSTs are refused and write nothing', async ({ page, signInAs }) => {
    const { tenant, ids, m } = await setup();
    await signInAs(m.email);
    await page.goto('/projects');
    const sent = await page.request.post('/api/dev/notifications', {
      data: { kind: 'field_conflict', params: {} },
      headers: appOriginHeaders(),
    });
    expect(sent.status()).toBe(201);

    const P1 = ids.P1;
    const versionsBefore = await versionCount(P1);
    const floorBefore = await floorRow(P1);
    const body = { lockEpoch: await lockEpoch(P1), changes: [await renameChange(P1)] };

    for (const headers of [CROSS, SIBLING]) {
      const answers = [
        await page.request.post(`/api/projects/${P1}/checkpoints`, { headers }),
        await page.request.post(`/api/projects/${P1}/objects`, { data: body, headers }),
        await page.request.post('/api/notifications/read-all', { headers }),
      ];
      for (const res of answers) {
        expect(res.status()).toBe(403);
        expect(await res.json()).toEqual(REFUSED);
      }
    }

    expect(await versionCount(P1)).toBe(versionsBefore);
    expect((await floorRow(P1)).data.name).toBe(floorBefore.data.name);
    expect(await readAt(tenant)).toEqual([null]);
  });

  test('EZD-346 B2 the same POSTs from the own page succeed', async ({ page, signInAs }) => {
    const { tenant, ids, m } = await setup();
    await signInAs(m.email);
    await page.goto('/projects');
    const sent = await page.request.post('/api/dev/notifications', {
      data: { kind: 'field_conflict', params: {} },
      headers: appOriginHeaders(),
    });
    expect(sent.status()).toBe(201);

    const P1 = ids.P1;
    const versionsBefore = await versionCount(P1);
    const body = { lockEpoch: await lockEpoch(P1), changes: [await renameChange(P1)] };

    const post = (url: string, json?: unknown, extra: Record<string, string> = {}) =>
      page.evaluate(
        async ({ url, json, extra }) => {
          const res = await fetch(url, {
            method: 'POST',
            ...(json === undefined
              ? {}
              : {
                  headers: { 'content-type': 'application/json', ...extra },
                  body: JSON.stringify(json),
                }),
          });
          return { status: res.status, body: await res.json() };
        },
        { url, json, extra },
      );

    const checkpoint = await post(`/api/projects/${P1}/checkpoints`);
    expect(checkpoint.status).toBe(201);
    expect(await versionCount(P1)).toBe(versionsBefore + 1);

    const saved = await post(`/api/projects/${P1}/objects`, body, {
      'x-ezdraft-membership': m.membershipId,
    });
    expect(saved.status).toBe(200);
    expect((await floorRow(P1)).data.name).toBe(RENAMED);

    const readAll = await post('/api/notifications/read-all');
    expect(readAll.status).toBe(200);
    expect(readAll.body).toEqual({ marked: 1 });
    const reads = await readAt(tenant);
    expect(reads).toHaveLength(1);
    expect(reads[0]).not.toBeNull();
  });
});

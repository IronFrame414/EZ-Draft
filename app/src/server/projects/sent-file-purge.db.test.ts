// EZD-124 (AC-EZD-124-6; CLAUDE.md rule 4). Expected values: Q-0700 decisions 03 "Project Delete" (the EZD-025
// sent-file trigger lets a delete through only when no project row with the path's project id exists, checked by
// an owner-rights helper that ignores row-level security, reads the second path segment by a uuid regex and
// refuses non-uuids); EZD-025 (sent files of a live project are refused for every caller, the secret key
// included; moves stay refused). Storage calls go through the Storage API with the secret key, as the purge job's.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminDb,
  cleanup,
  closeHarness,
  createProjects,
  createTenant,
  harnessSql,
} from '../../../test-harness/rls/fixtures';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('EZD-124 sent files and the project purge', () => {
  let tenant = '';
  let live = '';
  let gone = '';
  const objects = (name: string) =>
    harnessSql()<{ n: number }[]>`
      select count(*)::int as n from storage.objects where bucket_id = 'exports' and name = ${name}`;
  const put = async (name: string) => {
    const r = await adminDb().storage.from('exports').upload(name, PNG, { contentType: 'image/png' });
    expect(r.error, name).toBeNull();
  };
  const sentPath = (project: string) => `${tenant}/${project}/sent/${randomUUID()}/set.pdf`;

  beforeAll(async () => {
    tenant = await createTenant();
    [live, gone] = await createProjects(tenant, 2);
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('a sent file of a live project is still refused for the secret key', async () => {
    const name = sentPath(live);
    await put(name);
    await adminDb().storage.from('exports').remove([name]);
    expect((await objects(name))[0].n).toBe(1);
    const bytes = await adminDb().storage.from('exports').download(name);
    expect(bytes.error).toBeNull();
  });

  it('once the project row is gone the purge may delete its sent files; moves stay refused', async () => {
    const a = sentPath(gone);
    const b = sentPath(gone);
    await put(a);
    await put(b);
    await harnessSql()`delete from public.project where id = ${gone}::uuid`;
    // A move of a sent file is still refused.
    const moved = await adminDb().storage.from('exports').move(b, `${tenant}/${gone}/out/moved.pdf`);
    expect(moved.error).not.toBeNull();
    expect((await objects(b))[0].n).toBe(1);
    const r = await adminDb().storage.from('exports').remove([a, b]);
    expect(r.error).toBeNull();
    expect((await objects(a))[0].n).toBe(0);
    expect((await objects(b))[0].n).toBe(0);
  });

  it('a sent path whose second segment is not a uuid stays refused', async () => {
    const name = `${tenant}/not-a-uuid/sent/${randomUUID()}/set.pdf`;
    await put(name);
    await adminDb().storage.from('exports').remove([name]);
    expect((await objects(name))[0].n).toBe(1);
    const helper = await harnessSql()<{ gone: boolean }[]>`
      select private.project_row_gone(${name}) as gone,
        private.project_row_gone(${`${tenant}/${live}/sent/x`}) as live,
        private.project_row_gone(${`${tenant}/${randomUUID()}/sent/x`}) as unknown`;
    expect(helper[0]).toEqual({ gone: false, live: false, unknown: true });
  });
});

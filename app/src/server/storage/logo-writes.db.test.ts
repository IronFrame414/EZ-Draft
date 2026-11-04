// EZD-295 T1-T3 (vault/plans/EZD-295.md section 4; AC-EZD-295-1, -2). Expected values: Decided D1-D3 (the media
// logo insert and delete policies need a request from the server, `private.storage_request_from_server()`; the
// insert policy allows only operation `storage.object.upload`). Member M has the settings_company switch on and
// puts X through the gated serverDb; the browser-side client (no gate header) must be refused everywhere.
// "Absent" and "unchanged" are read through adminDb() (list, download sha256).
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_100 = Uint8Array.from([...PNG_SIG, ...new Array(92).fill(0)]);
const OTHER = Uint8Array.from([...PNG_SIG, ...new Array(92).fill(7)]);
const SVG_SCRIPT = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);
const FN = 'private.storage_request_from_server()';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

describe('EZD-295 logo files written only by the server', () => {
  let tenant = '';
  let session: Session;
  const touched: string[] = [];

  const logoPath = () => {
    const p = `${tenant}/tenant/logo/${randomUUID()}.png`;
    touched.push(p);
    return p;
  };
  const present = async (path: string) => {
    const slash = path.lastIndexOf('/');
    const name = path.slice(slash + 1);
    const { data, error } = await adminDb()
      .storage.from('media')
      .list(path.slice(0, slash), { search: name });
    expect(error).toBeNull();
    return (data ?? []).some((o) => o.name === name);
  };
  const hashOf = async (path: string) => {
    const { data, error } = await adminDb().storage.from('media').download(path);
    expect(error).toBeNull();
    return sha(new Uint8Array(await (data as Blob).arrayBuffer()));
  };

  beforeAll(async () => {
    tenant = await createTenant();
    const member = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, member.membershipId, ['settings_company']);
    session = await signIn(member.email);
  }, 180000);

  afterAll(async () => {
    try {
      await adminDb().storage.from('media').remove(touched);
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  async function putX(): Promise<string> {
    const x = logoPath();
    const put = await session.serverDb.storage
      .from('media')
      .upload(x, PNG_100, { contentType: 'image/png' });
    expect(put.error).toBeNull();
    return x;
  }

  it('T1 a member cannot put, sign, overwrite, remove, copy or move a logo file around the server', async () => {
    const x = await putX();
    const original = sha(PNG_100);
    const keeps = async () => {
      expect(await present(x)).toBe(true);
      expect(await hashOf(x)).toBe(original);
    };
    const b = session.browserDb.storage.from('media');

    const newPath = logoPath();
    const a = await b.upload(newPath, PNG_100, { contentType: 'image/png' });
    expect(a.error).not.toBeNull();
    expect(await present(newPath)).toBe(false);
    await keeps();

    const signed = await b.createSignedUploadUrl(logoPath());
    expect(signed.error).not.toBeNull();
    await keeps();

    const over = await b.upload(x, OTHER, { contentType: 'image/png', upsert: true });
    expect(over.error).not.toBeNull();
    await keeps();

    await b.remove([x]);
    await keeps();

    const newPath2 = logoPath();
    const copied = await b.copy(x, newPath2);
    expect(copied.error).not.toBeNull();
    expect(await present(newPath2)).toBe(false);
    await keeps();

    const newPath3 = logoPath();
    const moved = await b.move(x, newPath3);
    expect(moved.error).not.toBeNull();
    expect(await present(newPath3)).toBe(false);
    await keeps();
  }, 60000);

  it('T2 delete then re-upload is refused; the server path signs nothing, puts and removes', async () => {
    const x = await putX();
    const original = sha(PNG_100);
    const b = session.browserDb.storage.from('media');

    await b.remove([x]);
    const again = await b.upload(x, SVG_SCRIPT, { contentType: 'image/svg+xml' });
    expect(again.error).not.toBeNull();
    expect(await hashOf(x)).toBe(original);

    const s = session.serverDb.storage.from('media');
    const signed = await s.createSignedUploadUrl(logoPath());
    expect(signed.error).not.toBeNull();

    const newPath4 = logoPath();
    const stored = await s.upload(newPath4, PNG_100, { contentType: 'image/png' });
    expect(stored.error).toBeNull();
    expect(await present(newPath4)).toBe(true);
    const removed = await s.remove([newPath4]);
    expect(removed.error).toBeNull();
    expect(await present(newPath4)).toBe(false);
  }, 60000);

  it('T3 catalog: both policies call the server check, insert allows only upload, the function is locked down', async () => {
    const sql = harnessSql();
    const policies = await sql<
      { policyname: string; qual: string | null; with_check: string | null }[]
    >`
      select policyname, qual, with_check from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname in ('storage_media_insert', 'storage_media_delete')`;
    expect(policies.map((p) => p.policyname).sort()).toEqual([
      'storage_media_delete',
      'storage_media_insert',
    ]);
    for (const p of policies) {
      expect(`${p.qual ?? ''} ${p.with_check ?? ''}`, p.policyname).toContain(
        'storage_request_from_server',
      );
    }
    const insert = policies.find((p) => p.policyname === 'storage_media_insert');
    expect(insert?.with_check).toContain('storage.object.upload');

    const fn = await sql<{ prosecdef: boolean; proconfig: string[] | null; anon: boolean }[]>`
      select p.prosecdef, p.proconfig,
        has_function_privilege('anon', p.oid, 'execute') as anon
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private' and p.proname = 'storage_request_from_server'`;
    expect(fn).toHaveLength(1);
    expect(fn[0].prosecdef).toBe(true);
    expect(fn[0].proconfig).toEqual(['search_path=""']);
    expect(fn[0].anon).toBe(false);
    const auth = await sql<{ ok: boolean }[]>`
      select has_function_privilege('authenticated', ${FN}, 'execute') as ok`;
    expect(auth[0].ok).toBe(true);
  });
});

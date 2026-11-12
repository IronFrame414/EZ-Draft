// EZD-290 T6 (vault/plans/EZD-290.md section 4; AC-EZD-290-3). Expected values: build step 1 (the migration sets
// `media` to file_size_limit 4000000 and allowed_mime_types png, jpeg, svg+xml). The member puts through the gated
// serverDb to its own logo path (the media insert policy, EZD-132 K2); the bucket refuses by size and type.
import { randomUUID } from 'node:crypto';
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
const PNG_4MB_PLUS_1 = Uint8Array.from([...PNG_SIG, ...new Array(3_999_993).fill(0)]);

describe('EZD-290 media bucket limits', () => {
  let tenant = '';
  let session: Session;
  const uploaded: string[] = [];

  beforeAll(async () => {
    tenant = await createTenant();
    const member = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, member.membershipId, ['settings_company']);
    session = await signIn(member.email);
  }, 180000);

  afterAll(async () => {
    await adminDb().storage.from('media').remove(uploaded);
    await cleanup();
    await closeHarness();
  });

  const logoPath = (ext: string) => `${tenant}/tenant/logo/${randomUUID()}.${ext}`;
  const objectExists = async (path: string) => {
    const slash = path.lastIndexOf('/');
    const name = path.slice(slash + 1);
    const { data, error } = await adminDb()
      .storage.from('media')
      .list(path.slice(0, slash), { search: name });
    expect(error).toBeNull();
    return (data ?? []).some((o) => o.name === name);
  };
  const put = async (path: string, bytes: Uint8Array, contentType: string) => {
    uploaded.push(path);
    return session.serverDb.storage.from('media').upload(path, bytes, { contentType });
  };

  it('T6 the media bucket holds a 4,000,000-byte limit and four image types, and refuses others', async () => {
    const rows = await harnessSql()`
      select file_size_limit, allowed_mime_types from storage.buckets where id = 'media'`;
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].file_size_limit)).toBe(4000000);
    // EZD-224 (vault/plans/EZD-224.md section 3 Shared lists; L-024, dated 2026-11-11, newest migration
    // 20261110130000): the three logo types plus image/webp.
    for (const type of ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']) {
      expect(rows[0].allowed_mime_types).toContain(type);
    }
    expect(rows[0].allowed_mime_types).toHaveLength(4);

    const html = logoPath('png');
    const htmlPut = await put(html, new Uint8Array(10).fill(0x61), 'text/html');
    expect(htmlPut.error).not.toBeNull();
    expect(await objectExists(html)).toBe(false);

    const big = logoPath('png');
    const bigPut = await put(big, PNG_4MB_PLUS_1, 'image/png');
    expect(bigPut.error).not.toBeNull();
    expect(await objectExists(big)).toBe(false);

    const small = logoPath('png');
    const smallPut = await put(small, PNG_100, 'image/png');
    expect(smallPut.error).toBeNull();
    expect(await objectExists(small)).toBe(true);
  }, 60000);
});

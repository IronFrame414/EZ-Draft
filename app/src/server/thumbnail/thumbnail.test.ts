// EZD-224 U1 (vault/plans/EZD-224.md section 4 "U1 fake client"; Decided "Server error mapping", "Start order",
// "GET order", "Unexpected RPC result", "isThumbnailPathFor"). No database and no Storage: the object helpers are
// mocked (the real StorageError is kept) and the client is the plan's fake DbClient.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../storage/objects', async (orig) => ({
  ...(await orig<typeof import('../storage/objects')>()),
  createSignedUpload: vi.fn(),
  signedDownloadUrl: vi.fn(),
}));

import { StorageError, createSignedUpload, signedDownloadUrl, type DbClient } from '../storage/objects';
import {
  THUMBNAIL_LIMIT_BYTES,
  completeCheckpointThumbnail,
  isThumbnailPathFor,
  projectThumbnailUrl,
  startCheckpointThumbnail,
} from './thumbnail';

const T = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const P = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const P2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const V = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PATH = 't/p/thumb/v.webp';
const S = { bucket: 'media', path: PATH, token: 't', url: 'u' } as const;

type RpcError = { code: string; message?: string } | null;
const fake = (opts: {
  data?: unknown;
  error?: RpcError;
  thumbnail_path?: unknown;
  row?: boolean;
  readError?: RpcError;
}) => {
  const rpc = vi.fn(async () => ({ data: opts.data ?? null, error: opts.error ?? null }));
  const from = vi.fn(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: opts.row === false ? null : { thumbnail_path: opts.thumbnail_path ?? null },
          error: opts.readError ?? null,
        }),
      }),
    }),
  }));
  return { db: { rpc, from } as unknown as DbClient, rpc, from };
};

const signMock = vi.mocked(createSignedUpload);
const linkMock = vi.mocked(signedDownloadUrl);

describe('EZD-224 server thumbnail functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('EZD-224 U1 server results map every RPC, Storage and read outcome', async () => {
    expect(THUMBNAIL_LIMIT_BYTES).toBe(40960);

    // isThumbnailPathFor: lower-case uuids, own project, .webp only.
    const good = `${T}/${P}/thumb/${V}.webp`;
    expect(isThumbnailPathFor(good, P)).toBe(true);
    expect(isThumbnailPathFor(good.toUpperCase(), P)).toBe(false);
    expect(isThumbnailPathFor(`${T}/${P}/thumb/${V}.png`, P)).toBe(false);
    expect(isThumbnailPathFor(good, P2)).toBe(false);

    // RPC errors map the same way for start and complete.
    const mapped: Array<[RpcError, string]> = [
      [{ code: '42501' }, 'permission_denied'],
      [{ code: 'P0002', message: 'version_not_found' }, 'version_not_found'],
      [{ code: 'P0002', message: 'project_not_found' }, 'project_not_found'],
      [{ code: 'P0001', message: 'thumbnail_invalid' }, 'thumbnail_invalid'],
    ];
    for (const [error, code] of mapped) {
      const a = fake({ error });
      expect(await startCheckpointThumbnail(a.db, P, V), `start ${code}`).toEqual({ ok: false, code });
      expect(a.rpc).toHaveBeenCalledWith('start_checkpoint_thumbnail', { p_project: P, p_version: V });
      const b = fake({ error });
      expect(await completeCheckpointThumbnail(b.db, P, V), `complete ${code}`).toEqual({ ok: false, code });
      expect(b.rpc).toHaveBeenCalledWith('set_checkpoint_thumbnail', { p_project: P, p_version: V });
    }
    expect(signMock).not.toHaveBeenCalled();
    await expect(startCheckpointThumbnail(fake({ error: { code: 'XX000' } }).db, P, V)).rejects.toBeTruthy();
    await expect(completeCheckpointThumbnail(fake({ error: { code: 'XX000' } }).db, P, V)).rejects.toBeTruthy();

    // Start: the signing outcome.
    signMock.mockResolvedValueOnce({ ...S });
    const started = fake({ data: PATH });
    expect(await startCheckpointThumbnail(started.db, P, V)).toEqual({ ok: true, upload: S });
    expect(signMock).toHaveBeenCalledWith(started.db, { bucket: 'media', path: PATH });
    signMock.mockRejectedValueOnce(new StorageError('upload_refused'));
    expect(await startCheckpointThumbnail(fake({ data: PATH }).db, P, V)).toEqual({
      ok: false,
      code: 'version_not_found',
    });
    signMock.mockRejectedValueOnce(new StorageError('storage_unavailable'));
    await expect(startCheckpointThumbnail(fake({ data: PATH }).db, P, V)).rejects.toMatchObject({
      code: 'storage_unavailable',
    });

    // Complete: the path comes back.
    expect(await completeCheckpointThumbnail(fake({ data: PATH }).db, P, V)).toEqual({
      ok: true,
      path: PATH,
    });

    // A non-string result with no error.
    await expect(startCheckpointThumbnail(fake({ data: 1 }).db, P, V)).rejects.toThrow(
      'start_checkpoint_thumbnail_unexpected_result',
    );
    await expect(completeCheckpointThumbnail(fake({ data: 1 }).db, P, V)).rejects.toThrow(
      'set_checkpoint_thumbnail_unexpected_result',
    );

    // GET reads.
    expect(await projectThumbnailUrl(fake({ row: false }).db, P)).toEqual({
      ok: false,
      code: 'project_not_found',
    });
    expect(await projectThumbnailUrl(fake({ thumbnail_path: null }).db, P)).toEqual({
      ok: false,
      code: 'thumbnail_not_found',
    });
    expect(await projectThumbnailUrl(fake({ thumbnail_path: `${T}/${P2}/thumb/${V}.webp` }).db, P)).toEqual({
      ok: false,
      code: 'thumbnail_not_found',
    });
    expect(linkMock).not.toHaveBeenCalled();
    linkMock.mockRejectedValueOnce(new StorageError('object_not_found'));
    expect(await projectThumbnailUrl(fake({ thumbnail_path: good }).db, P)).toEqual({
      ok: false,
      code: 'thumbnail_not_found',
    });
    linkMock.mockRejectedValueOnce(new StorageError('storage_unavailable'));
    await expect(projectThumbnailUrl(fake({ thumbnail_path: good }).db, P)).rejects.toMatchObject({
      code: 'storage_unavailable',
    });
    await expect(
      projectThumbnailUrl(fake({ row: true, readError: { code: 'XX000' } }).db, P),
    ).rejects.toBeTruthy();
    linkMock.mockResolvedValueOnce('https://x/s?token=t');
    const read = fake({ thumbnail_path: good });
    expect(await projectThumbnailUrl(read.db, P)).toEqual({ ok: true, url: 'https://x/s?token=t' });
    expect(linkMock).toHaveBeenLastCalledWith(read.db, { bucket: 'media', path: good });
  });
});

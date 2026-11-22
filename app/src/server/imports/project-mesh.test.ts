// EZD-503 (S05 Read heights from scan "Only when a GLB mesh exists for the project"): the editor page's mesh link is
// the newest uploaded Polycam GLB the project's imports name, signed from the sources bucket; none without one. Stub
// client, no live service (CLAUDE.md rule 5).
import { describe, expect, it } from 'vitest';
import type { DbClient } from '../storage/objects';
import { projectMeshUrl } from './project-mesh';

const PROJECT = '00000000-0000-4000-8000-000000000123';
const GLB_NEW = '00000000-0000-4000-8000-0000000000a1';
const GLB_OLD = '00000000-0000-4000-8000-0000000000a2';
const path = (id: string) => `00000000-0000-4000-8000-000000000001/${PROJECT}/${id}.glb`;

type FileRow = {
  id: string;
  kind: string;
  original_name: string;
  storage_path: string;
  uploaded_at: string | null;
};

function stub(
  jobs: { payload: unknown }[],
  files: FileRow[],
  sign: { error: unknown } | { url: string } = { url: 'https://signed/mesh' },
) {
  const calls = { jobFilters: [] as [string, unknown][], signed: [] as [string, string][] };
  const jobQuery = {
    select: () => jobQuery,
    eq: (c: string, v: unknown) => (calls.jobFilters.push([c, v]), jobQuery),
    order: () => jobQuery,
    limit: async () => ({ data: jobs, error: null }),
  };
  let wanted: string[] = [];
  const fileQuery = {
    select: () => fileQuery,
    eq: () => fileQuery,
    in: async (_c: string, ids: string[]) => {
      wanted = ids;
      return { data: files.filter((f) => wanted.includes(f.id)), error: null };
    },
  };
  const client = {
    from: (table: string) => (table === 'job' ? jobQuery : fileQuery),
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (p: string) => {
          calls.signed.push([bucket, p]);
          return 'url' in sign
            ? { data: { signedUrl: sign.url }, error: null }
            : { data: null, error: sign.error };
        },
      }),
    },
  } as unknown as DbClient;
  return { client, calls };
}

const glb = (id: string, uploaded = true): FileRow => ({
  id,
  kind: 'polycam_glb',
  original_name: 'scan.glb',
  storage_path: path(id),
  uploaded_at: uploaded ? '2026-11-20T10:00:00Z' : null,
});

describe('EZD-503 project mesh link', () => {
  it("signs the newest import's uploaded GLB from the sources bucket", async () => {
    const s = stub(
      [
        { payload: { sourceFileIds: [], meshFileIds: [GLB_NEW] } },
        { payload: { meshFileIds: [GLB_OLD] } },
      ],
      [glb(GLB_OLD), glb(GLB_NEW)],
    );
    await expect(projectMeshUrl(s.client, PROJECT)).resolves.toBe('https://signed/mesh');
    expect(s.calls.jobFilters).toEqual([
      ['project_id', PROJECT],
      ['kind', 'import'],
    ]);
    expect(s.calls.signed).toEqual([['sources', path(GLB_NEW)]]);
  });

  it('skips a GLB whose upload never finished', async () => {
    const s = stub(
      [{ payload: { meshFileIds: [GLB_NEW] } }, { payload: { meshFileIds: [GLB_OLD] } }],
      [glb(GLB_NEW, false), glb(GLB_OLD)],
    );
    await projectMeshUrl(s.client, PROJECT);
    expect(s.calls.signed).toEqual([['sources', path(GLB_OLD)]]);
  });

  it('is null without a GLB, for a malformed project id, and when the object is missing', async () => {
    expect(
      await projectMeshUrl(stub([{ payload: { sourceFileIds: [] } }], []).client, PROJECT),
    ).toBeNull();
    expect(
      await projectMeshUrl(
        stub([{ payload: { meshFileIds: [GLB_NEW] } }], [glb(GLB_NEW)]).client,
        'x',
      ),
    ).toBeNull();
    const missing = stub([{ payload: { meshFileIds: [GLB_NEW] } }], [glb(GLB_NEW)], {
      error: { statusCode: '404' },
    });
    expect(await projectMeshUrl(missing.client, PROJECT)).toBeNull();
  });
});

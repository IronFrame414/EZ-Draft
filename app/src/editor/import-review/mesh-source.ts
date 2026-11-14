// EZD-307 (S02 Show 3D mesh; AC-EZD-307-2): where Show 3D mesh gets the GLB. The signed link in the review lasts
// 900 s (SIGNED_DOWNLOAD_SECONDS), and the review stops reading the import once it is ready, so every load asks the
// review route again for a fresh link instead of using the one read when the review opened. A retry after a failed
// load therefore uses a new link too.
import type { GlbMesh } from '../../lib/imports/polycam-glb/read-glb';

/** The import's current mesh link from GET /api/projects/[id]/imports/[jobId]; null without a GLB. */
export async function readMeshUrl(
  projectId: string,
  jobId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const res = await fetchImpl(`/api/projects/${projectId}/imports/${jobId}`, {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!res.ok) {
    await res.text().catch(() => '');
    throw new Error(`import read failed: ${res.status}`);
  }
  const body = (await res.json()) as { review?: { meshUrl?: unknown } };
  return typeof body.review?.meshUrl === 'string' ? body.review.meshUrl : null;
}

/** One load of the mesh: a fresh link, then the GLB from it. */
export async function loadMesh(deps: {
  meshUrl: () => Promise<string | null>;
  fetchGlb: (url: string) => Promise<GlbMesh>;
}): Promise<GlbMesh> {
  const url = await deps.meshUrl();
  if (!url) throw new Error('no mesh');
  return deps.fetchGlb(url);
}

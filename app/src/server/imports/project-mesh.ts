// EZD-503 (S05 Controls "Read heights from scan (not in mockup) | Ceiling type editor | Fills heights and slope from
// the Polycam mesh. | Only when a GLB mesh exists for the project."): the project's newest Polycam GLB as a
// short-lived signed link, read by the editor page with the caller's session (job and file RLS decide what it sees),
// so the editor shows Read heights from scan only when one exists. A GLB reaches a project only through an import,
// whose job payload lists it (meshFileIds, EZD-307), so the newest import that names an uploaded GLB gives the link;
// the files are read through the source-file helper (EZD-322: only it names that table). Null when the project has
// no GLB, or when its object is missing or refused (the button stays hidden, as Show 3D mesh does in review.ts).
// The page signs at load because a new route would have to join the route harness (vault/build/assumptions.md
// EZD-503); the link lasts SIGNED_DOWNLOAD_SECONDS, and a read after that asks for a reload.
import { z } from 'zod';
import { signedDownloadUrl, StorageError, type DbClient } from '../storage/objects';
import { readReviewSourceFiles } from '../storage/source-files';

/** How many of the newest imports are looked through for a GLB. */
export const MESH_IMPORTS_READ = 50;

const payloadSchema = z.object({ meshFileIds: z.array(z.string()).optional() });

export async function projectMeshUrl(client: DbClient, projectId: string): Promise<string | null> {
  if (!z.uuid().safeParse(projectId).success) return null;
  const jobs = await client
    .from('job')
    .select('payload')
    .eq('project_id', projectId)
    .eq('kind', 'import')
    .order('created_at', { ascending: false })
    .limit(MESH_IMPORTS_READ);
  if (jobs.error) throw jobs.error;
  const ids: string[] = [];
  for (const job of jobs.data) {
    const p = payloadSchema.safeParse(job.payload);
    if (p.success)
      ids.push(...(p.data.meshFileIds ?? []).filter((id) => z.uuid().safeParse(id).success));
  }
  if (ids.length === 0) return null;
  const files = await readReviewSourceFiles(client, projectId, ids);
  const mesh = ids
    .map((id) => files.get(id.toLowerCase()))
    .find((f) => f !== undefined && f.kind === 'polycam_glb' && f.uploaded);
  if (mesh === undefined) return null;
  try {
    return await signedDownloadUrl(client, { bucket: 'sources', path: mesh.storagePath });
  } catch (e) {
    if (e instanceof StorageError) return null;
    throw e;
  }
}

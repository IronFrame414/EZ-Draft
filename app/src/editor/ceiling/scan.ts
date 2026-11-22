// EZD-503 (S05 Controls "Read heights from scan (not in mockup) | Ceiling type editor | Fills heights and slope from
// the Polycam mesh. | Only when a GLB mesh exists for the project."): one read of the project's Polycam GLB for the
// ceiling type editor, with EZD-303's reader. Loaded on the first press only (11 Budgets), so the GLB reader stays out
// of the editor's first download. The link is the one the editor page signed (server/imports/project-mesh.ts).
import {
  ceilingMesh,
  readCeiling,
  type CeilingMesh,
  type CeilingReading,
} from '../../lib/imports/polycam-glb/ceiling';
import { readGlb } from '../../lib/imports/polycam-glb/read-glb';

export type ScanCeiling = { mesh: CeilingMesh | null; reading: CeilingReading | null };

export async function readScanCeiling(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ScanCeiling> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`mesh download failed: ${res.status}`);
  const glb = readGlb(new Uint8Array(await res.arrayBuffer()));
  return { mesh: ceilingMesh(glb), reading: readCeiling(glb) };
}

// EZD-301 (S01 Continue to review; Events emitted import.started): an import starts only from files of this
// project whose upload completed. Reads go through the caller's client, so RLS hides another company's project and
// files (a hidden project is project_not_found, a hidden or other project's file is source_file_not_found).
// EZD-302: scanIds are the Polycam floor plan DXFs among the files, the ones the import job detects.
// EZD-307: meshIds are the Polycam meshes (GLB) among them, carried in the job payload so Import review can offer
// Show 3D mesh for this import (S02 Show 3D mesh "Only when a GLB was uploaded").
import type { DbClient } from '../storage';
import { readSourceFileRefs } from '../storage/source-files';

export type StartImportResult =
  | { ok: true; tenantId: string; scanIds?: string[]; meshIds?: string[] }
  | { ok: false; code: 'project_not_found' | 'source_file_not_found' | 'upload_missing' };

export async function checkImportFiles(
  client: DbClient,
  projectId: string,
  sourceFileIds: readonly string[],
): Promise<StartImportResult> {
  const project = await client
    .from('project')
    .select('id, tenant_id')
    .eq('id', projectId)
    .maybeSingle();
  if (project.error) throw project.error;
  if (!project.data) return { ok: false, code: 'project_not_found' };
  const refs = await readSourceFileRefs(client, sourceFileIds);
  const scanIds: string[] = [];
  const meshIds: string[] = [];
  for (const id of sourceFileIds) {
    const ref = refs.get(id.toLowerCase());
    if (ref === undefined || ref.projectId !== projectId) {
      return { ok: false, code: 'source_file_not_found' };
    }
    if (!ref.uploaded) return { ok: false, code: 'upload_missing' };
    if (ref.kind === 'polycam_dxf') scanIds.push(id);
    if (ref.kind === 'polycam_glb') meshIds.push(id);
  }
  return { ok: true, tenantId: project.data.tenant_id, scanIds, meshIds };
}

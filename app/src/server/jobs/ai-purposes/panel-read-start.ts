// EZD-606 (S06 Controls "Existing panel ... (AI reads brand, rating, spaces; user confirms) ... read from directory
// photo"; 02 Stack "AI runs in jobs"): starts one panel photo read under the member's session. The photo is a
// panel_photo source_file of this project whose upload has completed; the row is read through the session client
// (RLS), so a file of another company or project is not found. enqueue_job checks the company and project again. The
// browser follows the job on the project channel (job.progress) and at /api/jobs/[id]; its result is
// { purpose, output } with output a PanelLabelOutput or PanelDirectoryOutput.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PANEL_PHOTO_TYPES,
  PANEL_READ_PURPOSE,
  type PanelPhotoType,
  type PanelRead,
} from '../../../lib/electrical/panel-read';
import type { Database } from '../../db/database.types';
import { readPanelPhotoFile } from '../../storage/source-files';
import { enqueueJob } from '../enqueue';

type Client = SupabaseClient<Database>;

export type StartedPanelRead = { jobId: string } | { refused: 'file_not_found' };

export async function startPanelRead(
  client: Client,
  projectId: string,
  fileId: string,
  read: PanelRead,
  options: { kick?: () => void } = {},
): Promise<StartedPanelRead> {
  const photo = await readPanelPhotoFile(client, projectId, fileId);
  if (photo === null || !(PANEL_PHOTO_TYPES as readonly string[]).includes(photo.contentType)) {
    return { refused: 'file_not_found' };
  }
  const payload = {
    purpose: PANEL_READ_PURPOSE[read],
    input: {
      image: { bucket: 'sources', path: photo.storagePath },
      mediaType: photo.contentType as PanelPhotoType,
    },
  };
  const { id } = await enqueueJob(client, { kind: 'ai_read', projectId, payload }, options);
  return { jobId: id };
}

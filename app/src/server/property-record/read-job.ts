// EZD-711 (S01 Property appraiser link; S13 Controls "Property appraiser import"; 02 Stack "AI runs in jobs"): starts
// one ai_read job for a link, pasted page text or a screenshot, under the member's session (enqueue_job checks the
// company and project). The browser follows the job at /api/jobs/[id]; its result is { purpose, output } with output
// an AppraiserReadOutput. A link the server may not fetch is answered at once as unreadable, with no job.
// A screenshot is first stored in the jobs bucket by the screenshot purpose's storeAppraiserScreenshot.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScreenshotType } from '../../lib/property-record/property-record';
import type { Database } from '../db/database.types';
import {
  APPRAISER_READ_PURPOSE,
  APPRAISER_SCREENSHOT_PURPOSE,
  APPRAISER_TEXT_PURPOSE,
} from '../jobs/ai-purposes/property-appraiser-recording';
import { storeAppraiserScreenshot } from '../jobs/ai-purposes/property-appraiser-screenshot';
import { enqueueJob } from '../jobs/enqueue';
import { isAppraiserUrl } from './appraiser-hosts';

type Client = SupabaseClient<Database>;

export type ReadSource =
  | { kind: 'link'; url: string }
  | { kind: 'text'; text: string }
  | { kind: 'screenshot'; bytes: Uint8Array; mediaType: ScreenshotType };

export type StartedRead = { jobId: string } | { unreadable: true };

async function tenantId(client: Client): Promise<string> {
  const { data, error } = await client.from('tenant').select('id').maybeSingle();
  if (error) throw error;
  if (data === null) throw new Error('tenant_not_found');
  return data.id;
}

export async function startAppraiserRead(
  client: Client,
  projectId: string | null,
  source: ReadSource,
  options: { kick?: () => void } = {},
): Promise<StartedRead> {
  let payload: { purpose: string; input: unknown };
  if (source.kind === 'link') {
    if (!isAppraiserUrl(source.url)) return { unreadable: true };
    payload = { purpose: APPRAISER_READ_PURPOSE, input: { url: source.url.trim() } };
  } else if (source.kind === 'text') {
    payload = { purpose: APPRAISER_TEXT_PURPOSE, input: { text: source.text } };
  } else {
    const image = await storeAppraiserScreenshot(await tenantId(client), projectId, source.bytes, source.mediaType);
    payload = {
      purpose: APPRAISER_SCREENSHOT_PURPOSE,
      input: { image, mediaType: source.mediaType },
    };
  }
  const { id } = await enqueueJob(client, { kind: 'ai_read', projectId, payload }, options);
  return { jobId: id };
}

// EZD-711 (S01 Property appraiser link "On read failure, offer ... 'Paste screenshot' for AI extraction"): the
// screenshot read. The route stores the image (storeAppraiserScreenshot) in the jobs bucket under the job's tenant (and project) folder; the
// payload names it (the runner checks the path is inside the job). A missing image answers `unreadable`. Safe to run
// twice: it reads the image and writes nothing.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  SCREENSHOT_MAX_BYTES,
  SCREENSHOT_TYPES,
  appraiserReadOutputSchema,
  type AppraiserReadOutput,
  type ScreenshotType,
} from '../../../lib/property-record/property-record';
import { createJobsDbClient } from '../db';
import { JobError } from '../errors';
import { storagePathSchema, type StoragePath } from '../storage-path';
import type { AiPurpose } from './index';
import { readAppraiserFields } from './property-appraiser-read';
import { APPRAISER_SCREENSHOT_PURPOSE } from './property-appraiser-recording';

export { APPRAISER_SCREENSHOT_PURPOSE };

export type AppraiserScreenshotInput = { image: StoragePath; mediaType: ScreenshotType };

type ReadImage = (target: StoragePath) => Promise<Uint8Array | null>;

const READ_KEY = '__ezdAppraiserReadImage';

/** Test seam: how the purpose reads the stored image (null restores the jobs bucket read). */
export function setAppraiserImageReader(fn: ReadImage | null): void {
  const g = globalThis as unknown as Record<string, ReadImage | undefined>;
  if (fn === null) delete g[READ_KEY];
  else g[READ_KEY] = fn;
}

const bucketRead: ReadImage = async (target) => {
  const { data, error } = await createJobsDbClient().storage.from(target.bucket).download(target.path);
  if (error) {
    const status = (error as { status?: unknown; statusCode?: unknown }).status ??
      (error as { statusCode?: unknown }).statusCode;
    if (Number(status) === 404 || Number(status) === 400) return null;
    throw new JobError('storage_unavailable', { retry: true });
  }
  return new Uint8Array(await data.arrayBuffer());
};

const EXT: Record<ScreenshotType, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/**
 * Stores a screenshot for a read in the jobs bucket (no member policy, so the secret key; the calling route has
 * checked Edit model and the project) under <tenant>/<project or tenant>/property-appraiser/<uuid>/in/, inside the
 * job's folder as the runner checks. Returns the payload's image path.
 */
export async function storeAppraiserScreenshot(
  tenantId: string,
  projectId: string | null,
  bytes: Uint8Array,
  mediaType: ScreenshotType,
): Promise<StoragePath> {
  if (bytes.byteLength === 0 || bytes.byteLength > SCREENSHOT_MAX_BYTES) throw new Error('invalid_screenshot');
  const path = `${tenantId}/${projectId ?? 'tenant'}/property-appraiser/${randomUUID()}/in/screenshot.${EXT[mediaType]}`;
  const { error } = await createJobsDbClient()
    .storage.from('jobs')
    .upload(path, bytes, { contentType: mediaType, upsert: false });
  if (error) throw new Error('storage_unavailable');
  return { bucket: 'jobs', path };
}

export const appraiserScreenshotPurpose: AiPurpose<AppraiserScreenshotInput, AppraiserReadOutput> = {
  purpose: APPRAISER_SCREENSHOT_PURPOSE,
  input: z
    .object({
      image: storagePathSchema.refine((p) => p.bucket === 'jobs'),
      mediaType: z.enum(SCREENSHOT_TYPES),
    })
    .strict(),
  output: appraiserReadOutputSchema,
  async run(ctx, input) {
    const read = (globalThis as unknown as Record<string, ReadImage | undefined>)[READ_KEY] ?? bucketRead;
    const bytes = await read(input.image);
    if (bytes === null || bytes.byteLength === 0 || bytes.byteLength > SCREENSHOT_MAX_BYTES) {
      return { status: 'unreadable' };
    }
    return readAppraiserFields(ctx, APPRAISER_SCREENSHOT_PURPOSE, {
      type: 'image',
      image: { mediaType: input.mediaType, data: bytes },
    });
  },
};

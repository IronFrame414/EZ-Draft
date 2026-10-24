// EZD-009 Step 5 (vault/plans/EZD-009.md): job inputs and outputs are Storage paths, never request bodies.
// Buckets and the `<tenant_id>/<project_id | tenant>/...` layout: docs/architecture.md Storage buckets and
// paths. The tenant-prefix check keeps a crafted payload from making a secret-key handler read another
// tenant's files.
import { z } from 'zod';

export const storagePathSchema = z.object({
  bucket: z.enum(['sources', 'renders', 'exports', 'media', 'jobs']),
  path: z
    .string()
    .min(1)
    .refine((p) => !p.startsWith('/') && !p.includes('\\') && !p.split('/').includes('..')),
});

export type StoragePath = z.infer<typeof storagePathSchema>;

// An object shaped like a Storage path: it has string `bucket` and `path` keys.
function looksLikePath(value: object): value is { bucket: string; path: string } {
  const v = value as Record<string, unknown>;
  return typeof v.bucket === 'string' && typeof v.path === 'string';
}

function walk(value: unknown, visit: (p: { bucket: string; path: string }) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (looksLikePath(value)) visit(value);
  for (const item of Object.values(value)) walk(item, visit);
}

// Every Storage path in the value is well formed (enqueue does not know the tenant id yet).
export function assertPathsWellFormed(value: unknown): void {
  walk(value, (p) => {
    if (!storagePathSchema.safeParse(p).success) throw new Error('invalid_storage_path');
  });
}

// Every Storage path in the value is well formed and inside the job's tenant, and for a project job inside
// its project or its tenant folder.
export function assertPathsInJob(
  value: unknown,
  job: { tenant_id: string; project_id: string | null },
): void {
  const prefixes =
    job.project_id === null
      ? [`${job.tenant_id}/`]
      : [`${job.tenant_id}/${job.project_id}/`, `${job.tenant_id}/tenant/`];
  walk(value, (p) => {
    if (!storagePathSchema.safeParse(p).success) throw new Error('invalid_storage_path');
    if (!prefixes.some((prefix) => p.path.startsWith(prefix))) {
      throw new Error('storage_path_outside_job');
    }
  });
}

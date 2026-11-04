// EZD-132 Step 4 (vault/plans/EZD-132.md): the five private Storage buckets, the same values as
// storagePathSchema's bucket options (app/src/server/jobs/storage-path.ts) and docs/architecture.md Storage
// buckets and paths. Imported by browser and server.
export const STORAGE_BUCKETS = ['sources', 'renders', 'exports', 'media', 'jobs'] as const;

export type StorageBucket = (typeof STORAGE_BUCKETS)[number];

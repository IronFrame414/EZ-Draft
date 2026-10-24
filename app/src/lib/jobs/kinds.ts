// EZD-009 Step 5 (vault/plans/EZD-009.md): job kinds and statuses, the same values as the job table's
// check constraints (Step 1; 03 Tables job, plus `test`). Imported by browser and server.
export const JOB_KINDS = [
  'import',
  'export',
  'render',
  'ai_read',
  'thumbnail',
  'diff',
  'cleanup',
  'test',
] as const;

export const JOB_STATUSES = ['queued', 'running', 'done', 'failed'] as const;

export type JobKind = (typeof JOB_KINDS)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];

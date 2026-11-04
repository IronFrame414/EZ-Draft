// EZD-009 Step 5 (vault/plans/EZD-009.md): job kinds and statuses, the same values as the job table's
// check constraints (Step 1; 03 Tables job, plus `test`). Imported by browser and server.
// EZD-110a Step 5 adds notification_email (one email job per notification).
export const JOB_KINDS = [
  'import',
  'export',
  'render',
  'ai_read',
  'thumbnail',
  'diff',
  'cleanup',
  'test',
  'notification_email',
] as const;

export const JOB_STATUSES = ['queued', 'running', 'done', 'failed'] as const;

export type JobKind = (typeof JOB_KINDS)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];

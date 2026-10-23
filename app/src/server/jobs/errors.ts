// EZD-009 Step 5 (vault/plans/EZD-009.md): a job error carries a stable code (the job.error column check)
// and whether the runner may retry it (Step 4).
const CODE = /^[a-z][a-z0-9_]{0,63}$/;

export class JobError extends Error {
  readonly code: string;
  readonly retry: boolean;

  constructor(code: string, { retry }: { retry: boolean }) {
    if (!CODE.test(code)) throw new Error('invalid_job_error_code');
    super(code);
    this.name = 'JobError';
    this.code = code;
    this.retry = retry;
  }
}

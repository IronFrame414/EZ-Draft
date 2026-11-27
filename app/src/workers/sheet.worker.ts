// EZD-702b (11 rule 3): the sheet worker, pooled (createWorkerPool), serving the sheet SVG job.
// EZD-708a: through runSheetJob, which draws an RCP viewport with the lazy RCP module.
import { serveJobs, type JobScope } from './serve-jobs';
import { SHEET_JOB, runSheetJob } from './sheet-job';

serveJobs(self as unknown as JobScope, { [SHEET_JOB]: (input) => runSheetJob(input) });

// EZD-702b (11 rule 3): the sheet worker, pooled (createWorkerPool), serving the sheet SVG job.
import { serveJobs, type JobScope } from './serve-jobs';
import { SHEET_JOB, sheetJob } from './sheet-job';

serveJobs(self as unknown as JobScope, { [SHEET_JOB]: (input) => sheetJob(input) });

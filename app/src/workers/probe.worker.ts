// EZD-235b Build step 4 (vault/plans/EZD-235b.md): the perf probe's pooled worker, serving the room-area job.
import { serveJobs, type JobScope } from './serve-jobs';
import { PROBE_JOB, probeRoomAreas } from './probe-job';

serveJobs(self as unknown as JobScope, { [PROBE_JOB]: (input) => probeRoomAreas(input) });

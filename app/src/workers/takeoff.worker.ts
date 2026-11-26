// EZD-1611a: the takeoff's pooled worker (EZD-235b serveJobs), serving the room-finish takeoff job.
import { serveJobs, type JobScope } from './serve-jobs';
import { TAKEOFF_JOB, runTakeoff } from './takeoff-job';

serveJobs(self as unknown as JobScope, { [TAKEOFF_JOB]: (input) => runTakeoff(input) });

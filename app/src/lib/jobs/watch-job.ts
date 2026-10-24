// EZD-009 Step 7 (vault/plans/EZD-009.md): follow one job over the project channel (EZD-018). Push, not
// poll (11 rule 11): every job.progress event for this job is passed on; the job is fetched once when it
// first finishes and once after each Realtime resync. No timers and no retries.
import type { ProjectHandle } from '../realtime/hub';
import type { JobStatus } from './kinds';

export type JobUpdate = {
  status: JobStatus;
  progress: number;
  attempts: number;
  result?: unknown;
  error?: string | null;
};

export type WatchedJob = {
  status: JobStatus;
  progress: number;
  attempts: number;
  result: unknown;
  error: string | null;
};

export function watchJob({
  channel,
  jobId,
  fetchJob,
  onChange,
}: {
  channel: Pick<ProjectHandle, 'on' | 'onResync'>;
  jobId: string;
  fetchJob: (jobId: string) => Promise<WatchedJob>;
  onChange: (update: JobUpdate) => void;
}): () => void {
  let fetchedOnFinish = false;
  const fetchOnce = () => {
    fetchJob(jobId).then(
      ({ status, progress, attempts, result, error }) =>
        onChange({ status, progress, attempts, result, error }),
      () => {
        // A failed fetch is ignored: the next resync fetches again.
      },
    );
  };

  const offEvent = channel.on('job.progress', (payload) => {
    if (payload.jobId !== jobId) return;
    onChange({ status: payload.status, progress: payload.progress, attempts: payload.attempts });
    if (!fetchedOnFinish && (payload.status === 'done' || payload.status === 'failed')) {
      fetchedOnFinish = true;
      fetchOnce();
    }
  });
  const offResync = channel.onResync(() => fetchOnce());

  return () => {
    offEvent();
    offResync();
  };
}

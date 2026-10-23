'use client';
// EZD-009 Step 7 (vault/plans/EZD-009.md): joins the project channel, enqueues one test job when the join
// succeeds, then follows it with watchJob. Values only (ids, statuses, numbers, JSON). After the enqueue it
// makes no request of its own except watchJob's fetch when the job finishes or the channel resyncs.
import { useEffect, useRef, useState } from 'react';
import { watchJob, type JobUpdate, type WatchedJob } from '../../../lib/jobs/watch-job';
import { getRealtimeHub, type ProjectChannelEvents } from '../../../lib/realtime';

type ProgressEvent = ProjectChannelEvents['job.progress'];

async function fetchJob(jobId: string): Promise<WatchedJob> {
  const res = await fetch(`/api/jobs/${jobId}`, { cache: 'no-store' });
  if (res.status !== 200) throw new Error('job_fetch_failed');
  return ((await res.json()) as { job: WatchedJob }).job;
}

export function JobsProbe({
  projectId,
  steps,
  stepMs,
}: {
  projectId: string;
  steps: number;
  stepMs: number;
}) {
  const [jobId, setJobId] = useState('');
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState('');
  const [events, setEvents] = useState<Array<{ status: string; progress: number }>>([]);
  const [result, setResult] = useState('');
  const [pings, setPings] = useState(0);
  const [enqueuedAt, setEnqueuedAt] = useState<string | undefined>(undefined);
  const [doneAt, setDoneAt] = useState<string | undefined>(undefined);
  const doneSeen = useRef(false);

  useEffect(() => {
    const p = getRealtimeHub().project(projectId);
    let cancelled = false;
    let stopWatching = () => {};

    const onChange = (update: JobUpdate) => {
      if ('result' in update) {
        setResult(JSON.stringify(update.result));
      } else {
        setEvents((list) => [...list, { status: update.status, progress: update.progress }]);
        if (update.status === 'done' && !doneSeen.current) {
          doneSeen.current = true;
          setDoneAt(String(performance.now()));
        }
      }
      setStatus(update.status);
      setProgress(String(update.progress));
    };

    // Events that arrive before the enqueue response names the job are kept and replayed, because the
    // insert's queued event can reach the socket before the response does.
    const early: ProgressEvent[] = [];
    const offEarly = p.on('job.progress', (payload) => early.push(payload));

    void p.ready.then(async (joined) => {
      if (joined !== 'subscribed' || cancelled) return;
      const res = await fetch('/api/dev/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, steps, stepMs }),
      });
      if (cancelled || res.status !== 201) return;
      const { job } = (await res.json()) as { job: { id: string } };
      if (cancelled) return;
      setEnqueuedAt(String(performance.now()));
      setJobId(job.id);
      stopWatching = watchJob({ channel: p, jobId: job.id, fetchJob, onChange });
      offEarly();
      for (const e of early) {
        if (e.jobId === job.id) {
          onChange({ status: e.status, progress: e.progress, attempts: e.attempts });
        }
      }
    });

    return () => {
      cancelled = true;
      offEarly();
      stopWatching();
      p.release();
    };
  }, [projectId, steps, stepMs]);

  return (
    <div data-testid="jobs-probe" data-enqueued-at={enqueuedAt} data-done-at={doneAt}>
      <p data-testid="job-id">{jobId}</p>
      <p data-testid="job-status">{status}</p>
      <p data-testid="job-progress">{progress}</p>
      <ul data-testid="job-events">
        {events.map((e, i) => (
          <li key={i} data-status={e.status} data-progress={e.progress} />
        ))}
      </ul>
      <p data-testid="job-result">{result}</p>
      <button type="button" data-testid="job-ping" onClick={() => setPings((n) => n + 1)}>
        {pings}
      </button>
    </div>
  );
}

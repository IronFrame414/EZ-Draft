// EZD-009 Step 5 (vault/plans/EZD-009.md): "started on enqueue". The run starts after the response has been
// sent, so it never delays the request (11 Also: background work never blocks the editor). An error is
// reported (EZD-024 Step 9) and swallowed; the sweep retries.
import { after } from 'next/server';
import { reportError } from '../errors/report';
import { defaultJobHooks } from './default-hooks';
import { runJobs } from './runner';

export function kickJobRunner(): void {
  after(async () => {
    try {
      await runJobs({ ...defaultJobHooks() });
    } catch (err) {
      // runJobs never throws; this guards the after() callback all the same.
      await reportError(err, { source: 'function', location: 'jobs.kick' });
    }
  });
}

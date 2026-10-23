// EZD-009 Step 5 (vault/plans/EZD-009.md): "started on enqueue". The run starts after the response has been
// sent, so it never delays the request (11 Also: background work never blocks the editor). Errors are
// swallowed: no logger exists yet, and the sweep retries (EZD-024 adds Sentry here).
import { after } from 'next/server';
import { runJobs } from './runner';

export function kickJobRunner(): void {
  after(async () => {
    try {
      await runJobs();
    } catch {
      // runJobs never throws; this guards the after() callback all the same.
    }
  });
}

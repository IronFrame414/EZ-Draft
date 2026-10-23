// EZD-009 Step 8 (vault/plans/EZD-009.md): expectSafeToRunTwice(kind, { payload, job? }) takes the handler
// from getHandlers(), builds each JobContext itself (progress a no-op, a fresh AbortController, fake clock)
// and runs the handler twice to completion on the same job id, asserting deep-equal outcomes. Later handler
// tickets call it once per kind; T19 (handlers.test.ts) fails when a registered kind has no call.
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { JobKind } from '../../src/lib/jobs/kinds';
import { getHandlers } from '../../src/server/jobs/handlers';
import type { JobRow } from '../../src/server/jobs/registry';
import { createFakeClock } from './fake-clock';

export async function expectSafeToRunTwice(
  kind: JobKind,
  { payload, job }: { payload: unknown; job?: Partial<JobRow> },
): Promise<void> {
  const handler = getHandlers()[kind];
  expect(handler, `a handler is registered for ${kind}`).toBeDefined();
  if (!handler) return;
  const jobId = job?.id ?? randomUUID();
  const tenantId = job?.tenant_id ?? randomUUID();

  const runToEnd = async (): Promise<unknown> => {
    const clock = createFakeClock();
    let state: unknown = null;
    for (let slice = 0; slice < 1000; slice++) {
      const ctx = {
        job: {
          id: jobId,
          tenant_id: tenantId,
          project_id: null,
          kind,
          attempts: 1,
          ...job,
        },
        payload: handler.payload.parse(payload),
        state,
        progress: async () => {},
        timeLeft: () => Number.MAX_SAFE_INTEGER,
        sleep: clock.sleep,
        signal: new AbortController().signal,
      };
      const outcome = await handler.run(ctx as never);
      if ('done' in outcome) return outcome;
      state = outcome.continue;
    }
    throw new Error('handler never finished');
  };

  const first = await runToEnd();
  const second = await runToEnd();
  expect(second).toEqual(first);
}

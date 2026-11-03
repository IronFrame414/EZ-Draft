// EZD-288 (vault/plans/EZD-288.md section 3, build step 1): the report check for a failed event emit, shared by
// the three EZD-288 test files. Copies expectReportedOnce of route-failure.test.ts (EZD-169) with the code,
// the location and the cause passed in. Expected values come from the plan (section 3, Sentry event and
// error_alert row) and the fingerprint (app/src/server/errors/fingerprint.ts). Local database and the stub
// Sentry transport only (CLAUDE.md rule 6).
import * as Sentry from '@sentry/nextjs';
import { expect } from 'vitest';
import { errorFingerprint } from '../../src/server/errors/fingerprint';
import { readSentryStubOutbox } from '../../src/server/errors/test-harness/sentry-stub-transport';
import { eventsIn } from '../sentry-outbox';
import { adminDb } from '../rls/fixtures';

export type ExpectedReport = { message: string; location: string; cause: string; hidden: string };

// The report of one failed emit: one stub event, and one error_alert row for its fingerprint.
export async function expectReportedOnce(expected: ExpectedReport): Promise<void> {
  await Sentry.flush(2000);
  const events = eventsIn(readSentryStubOutbox());
  expect(events).toHaveLength(1);
  const event = events[0];
  expect(event.exception.values[0].type).toBe('Error');
  expect(event.exception.values[0].value).toBe(expected.message);
  expect(event.tags['ezd.source']).toBe('function');
  expect(event.tags['ezd.location']).toBe(expected.location);
  expect(event.tags['ezd.cause']).toBe(expected.cause);
  expect(JSON.stringify(event)).not.toContain(expected.hidden);

  const { data, error } = await adminDb()
    .from('error_alert')
    .select('kind, source, title, fingerprint, ref, occurrences');
  expect(error).toBeNull();
  expect(data).toHaveLength(1);
  expect(data?.[0]).toEqual({
    kind: 'error',
    source: 'function',
    title: `Error: ${expected.message}`,
    fingerprint: await errorFingerprint({
      source: 'function',
      type: 'Error',
      message: expected.message,
      location: expected.location,
    }),
    ref: event.event_id,
    occurrences: 1,
  });
}

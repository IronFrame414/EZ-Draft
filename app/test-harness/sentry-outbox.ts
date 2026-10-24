// EZD-024 Step 2 (vault/plans/EZD-024.md) · readers for the Sentry stub outbox folder (browser tests) and
// eventsIn(). Pattern: app/test-harness/email-outbox.ts (EZD-008a).
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { StubEnvelope } from '../src/server/errors/test-harness/sentry-stub-transport';

export function readSentryStubOutboxDir(dir: string): StubEnvelope[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as StubEnvelope);
}

export function clearSentryStubOutboxDir(dir: string): void {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) if (f.endsWith('.json')) rmSync(join(dir, f));
}

// The payloads of the items whose type is `event`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sentry event payloads are free-form JSON
export type StubEvent = Record<string, any>;

export function eventsIn(envelopes: StubEnvelope[]): StubEvent[] {
  const out: StubEvent[] = [];
  for (const envelope of envelopes) {
    for (const item of envelope.items) {
      if (item.header.type === 'event') out.push(item.payload as StubEvent);
    }
  }
  return out;
}

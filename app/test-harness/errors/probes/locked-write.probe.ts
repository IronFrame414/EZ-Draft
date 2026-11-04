// EZD-252 probe P2 (vault/plans/EZD-252.md section 3): the same write while holding holdErrorAlertLock is
// allowed, so the file passes (exit 0). Hooks as app/src/app/api/route-failure.test.ts lines 115-145.
// Run only by alert-write-guard.test.ts T2.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { alertStoreClient, recordAndAlert } from '../../../src/server/errors/report';
import { closeHarness, harnessSql } from '../../rls/fixtures';
import { holdErrorAlertLock } from '../alert-lock';

function probeInput() {
  const fingerprint = process.env.EZD252_PROBE_FINGERPRINT;
  if (!fingerprint)
    throw new Error('EZD252_PROBE_FINGERPRINT is not set: alert-write-guard.test.ts sets it');
  return {
    kind: 'error' as const,
    source: 'function' as const,
    fingerprint,
    title: 'Error: ezd252_probe',
    ref: null,
    tenantId: null,
    projectId: null,
    params: {
      kind: 'error' as const,
      title: 'Error: ezd252_probe',
      source: 'function' as const,
      location: '/ezd-252/probe',
      eventId: null,
    },
  };
}

let releaseLock: () => Promise<void> = async () => {};

beforeAll(async () => {
  releaseLock = await holdErrorAlertLock();
  await harnessSql()`delete from public.error_alert`;
}, 180000);

afterAll(async () => {
  try {
    await harnessSql()`delete from public.error_alert`;
    await closeHarness();
  } finally {
    await releaseLock();
  }
}, 180000);

describe('EZD-252 probe: locked write', () => {
  it('EZD-252 probe writes error_alert while holding the lock', async () => {
    const result = await recordAndAlert(alertStoreClient(), probeInput(), process.env);
    expect(result.alertId).not.toBeNull();
  });
});

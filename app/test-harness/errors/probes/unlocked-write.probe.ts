// EZD-252 probe P1 (vault/plans/EZD-252.md section 3): the app writes error_alert without holdErrorAlertLock.
// The trigger refuses the write, so recordAndAlert answers store_unavailable, and the setup file's afterEach
// fails the file (exit 1). Run only by alert-write-guard.test.ts T1.
import { describe, expect, it } from 'vitest';
import { alertStoreClient, recordAndAlert } from '../../../src/server/errors/report';

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

describe('EZD-252 probe: unlocked write', () => {
  it('EZD-252 probe writes error_alert without the lock', async () => {
    const result = await recordAndAlert(alertStoreClient(), probeInput(), process.env);
    expect(result).toEqual({ alert: 'store_unavailable', alertId: null });
  });
});

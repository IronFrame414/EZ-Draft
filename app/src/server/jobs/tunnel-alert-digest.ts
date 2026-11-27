// EZD-2020: the sweep's tunnel alert digest pass, with the runner's secret-key client
// (claim_tunnel_alert_digest and release_tunnel_alert_digest are service_role only).
import { createJobsDbClient } from './db';
import { sendTunnelAlertDigest, type DigestResult } from '../errors/tunnel-digest';

export async function sweepTunnelAlertDigest(): Promise<DigestResult> {
  return sendTunnelAlertDigest({ db: createJobsDbClient() });
}

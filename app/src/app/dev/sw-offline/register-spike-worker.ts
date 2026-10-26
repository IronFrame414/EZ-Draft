// EZD-164 Step 4 (vault/plans/EZD-164.md D-Register): registers the spike worker; never throws.
import type { SwEnv } from '../../../lib/pwa/register-sw';
import { SW_OFFLINE_SCOPE, SW_OFFLINE_WORKER_URL } from './constants';

export type SpikeSwResult = 'registered' | 'unsupported' | 'failed';

export type SpikeSwEnv = Pick<SwEnv, 'navigator'> & { window: Pick<Window, 'isSecureContext'> };

export async function registerSpikeWorker(
  env: SpikeSwEnv = { navigator: globalThis.navigator, window: globalThis.window },
): Promise<SpikeSwResult> {
  const container = env.navigator.serviceWorker;
  if (!('serviceWorker' in env.navigator) || !container || !env.window.isSecureContext) {
    return 'unsupported';
  }
  try {
    await container.register(SW_OFFLINE_WORKER_URL, {
      scope: SW_OFFLINE_SCOPE,
      updateViaCache: 'none',
    });
    return 'registered';
  } catch {
    return 'failed';
  }
}

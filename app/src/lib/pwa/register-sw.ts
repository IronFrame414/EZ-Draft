// EZD-013 Step 9 (vault/plans/EZD-013.md D4-D8): registers /sw.js after load; never throws.
export type SwResult = 'registered' | 'unsupported' | 'failed';

export type SwEnv = {
  navigator: { serviceWorker?: Pick<ServiceWorkerContainer, 'register'> };
  window: Pick<Window, 'isSecureContext' | 'addEventListener'>;
  document: Pick<Document, 'readyState'>;
};

export async function registerServiceWorker(
  env: SwEnv = {
    navigator: globalThis.navigator,
    window: globalThis.window,
    document: globalThis.document,
  },
): Promise<SwResult> {
  const container = env.navigator.serviceWorker;
  if (!('serviceWorker' in env.navigator) || !container || !env.window.isSecureContext) {
    return 'unsupported';
  }
  if (env.document.readyState !== 'complete') {
    await new Promise<void>((resolve) => {
      env.window.addEventListener('load', () => resolve(), { once: true });
    });
  }
  try {
    await env.navigator.serviceWorker!.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    return 'registered';
  } catch (error) {
    try {
      const { captureBrowserError } = await import('../errors/capture');
      captureBrowserError(error, 'pwa.register');
    } catch {
      // the report itself failed; registration still counts as failed
    }
    return 'failed';
  }
}

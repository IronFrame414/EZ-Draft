// EZD-024 Step 6 (vault/plans/EZD-024.md): handled errors in browser code (EZD-013's service-worker
// registration, later screens) go to Sentry through the tunnel with their location as a tag.
import * as Sentry from '@sentry/browser';

export function captureBrowserError(error: unknown, location: string): void {
  Sentry.withScope((scope) => {
    scope.setTag('ezd.location', location);
    Sentry.captureException(error);
  });
}

// EZD-024 Step 10 (vault/plans/EZD-024.md; Re-validation V4): server error reporting. register() starts the
// function client once per server instance; onRequestError reports every error Next.js catches in route
// handlers, server components and the request gate (proxy), so the cron sweep and every other function too.
import type { Instrumentation } from 'next';
import { initErrorReporting } from './server/errors/sentry-options';
import { reportError } from './server/errors/report';

export async function register(): Promise<void> {
  initErrorReporting(process.env, 'function');
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  errorRequest,
  errorContext,
) => {
  await reportError(error, {
    source: 'function',
    location: errorContext.routePath || errorRequest.path.split('?')[0],
  });
};

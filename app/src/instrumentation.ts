// EZD-024 Step 10 (vault/plans/EZD-024.md; Re-validation V4): server error reporting. register() starts the
// function client once per server instance; onRequestError reports every error Next.js catches in route
// handlers, server components and the request gate (proxy), so the cron sweep and every other function too.
// EZD-036: Node-only modules load by import() only outside the Edge build.
import type { Instrumentation } from 'next';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'edge') {
    const { initErrorReporting } = await import('./server/errors/sentry-options');
    initErrorReporting(process.env, 'function');
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  errorRequest,
  errorContext,
) => {
  if (process.env.NEXT_RUNTIME !== 'edge') {
    const { reportError } = await import('./server/errors/report');
    await reportError(error, {
      source: 'function',
      location: errorContext.routePath || errorRequest.path.split('?')[0],
    });
  }
};

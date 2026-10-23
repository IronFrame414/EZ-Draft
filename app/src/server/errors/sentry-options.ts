// EZD-024 Step 1 (vault/plans/EZD-024.md): Sentry options from env, read per call, never at module load. An
// unset value turns Sentry off instead of failing: error reporting must never break the app it reports on, and
// the owner email path does not depend on Sentry (planner's choice).
import { dsnFromString } from '@sentry/core';
import * as Sentry from '@sentry/nextjs';
import { PLACEHOLDER_DSN } from '../../lib/errors/browser-options';
import { scrubEvent } from '../../lib/errors/scrub';
import { createSentryStubTransport } from './test-harness/sentry-stub-transport';

export { PLACEHOLDER_DSN };

type Env = Record<string, string | undefined>;

export type SentryOffCode =
  | 'sentry_off'
  | 'sentry_transport_invalid'
  | 'sentry_stub_not_allowed'
  | 'sentry_dsn_not_set'
  | 'sentry_live_blocked_in_tests';

export type SentryOptions =
  | {
      enabled: true;
      dsn: string;
      transport?: ReturnType<typeof createSentryStubTransport>;
      environment: string;
      release?: string;
      sendDefaultPii: false;
      beforeSend: typeof scrubEvent;
    }
  | { enabled: false; code: SentryOffCode };

function validDsn(value: string | undefined): value is string {
  if (!value) return false;
  try {
    return dsnFromString(value) !== undefined;
  } catch {
    return false;
  }
}

export function getSentryOptions(env: Env): SentryOptions {
  const kind = env.SENTRY_TRANSPORT;
  if (!kind) return { enabled: false, code: 'sentry_off' };
  if (kind !== 'stub' && kind !== 'sentry')
    return { enabled: false, code: 'sentry_transport_invalid' };
  const common = {
    environment: env.VERCEL_ENV || 'local',
    ...(env.VERCEL_GIT_COMMIT_SHA ? { release: env.VERCEL_GIT_COMMIT_SHA } : {}),
    sendDefaultPii: false as const,
    beforeSend: scrubEvent,
  };
  if (kind === 'stub') {
    if (env.VERCEL_ENV === 'production') return { enabled: false, code: 'sentry_stub_not_allowed' };
    return {
      enabled: true,
      dsn: PLACEHOLDER_DSN,
      transport: createSentryStubTransport({ dir: env.SENTRY_STUB_DIR || undefined }),
      ...common,
    };
  }
  if (!validDsn(env.SENTRY_DSN)) return { enabled: false, code: 'sentry_dsn_not_set' };
  // CLAUDE.md rule 6: tests never reach a live provider.
  if (process.env.VITEST) return { enabled: false, code: 'sentry_live_blocked_in_tests' };
  return { enabled: true, dsn: env.SENTRY_DSN, ...common };
}

// Starts the server client (no tracing, profiling or replay; default integrations off) and tags every event
// with its runtime. Safe to call twice: the SDK keeps the first client. Returns 'ok' or the off code.
export function initErrorReporting(env: Env, runtimeTag: string): 'ok' | SentryOffCode {
  const options = getSentryOptions(env);
  if (!options.enabled) return options.code;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- `enabled` is not an SDK option
  const { enabled, ...sdkOptions } = options;
  Sentry.init({
    ...sdkOptions,
    defaultIntegrations: false,
    integrations: [Sentry.linkedErrorsIntegration()],
  });
  Sentry.getGlobalScope().setTag('ezd.source', runtimeTag);
  return 'ok';
}

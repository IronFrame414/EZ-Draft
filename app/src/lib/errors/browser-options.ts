// EZD-024 Step 6 (vault/plans/EZD-024.md): the browser Sentry options. The browser always sends to the app's
// own tunnel with the placeholder DSN; the server decides where envelopes go (Step 7), so no real DSN or
// build-time env value reaches the browser. Default integrations are off (size and privacy): only global
// error handlers, linked errors and dedupe. No tracing, replay or breadcrumbs.
import {
  dedupeIntegration,
  globalHandlersIntegration,
  linkedErrorsIntegration,
} from '@sentry/browser';
import { scrubEvent } from './scrub';

// `.invalid` is a reserved name (RFC 2606): nothing is ever sent to it.
export const PLACEHOLDER_DSN = 'https://public@ezdraft.invalid/1';
export const TUNNEL_PATH = '/api/monitoring';

export function browserSentryOptions() {
  return {
    dsn: PLACEHOLDER_DSN,
    tunnel: TUNNEL_PATH,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    initialScope: { tags: { 'ezd.source': 'browser' } },
    defaultIntegrations: false as const,
    integrations: [globalHandlersIntegration(), linkedErrorsIntegration(), dedupeIntegration()],
  };
}

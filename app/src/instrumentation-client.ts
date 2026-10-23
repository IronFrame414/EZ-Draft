// EZD-024 Step 6 (vault/plans/EZD-024.md): browser error reporting, always on. Envelopes go to the app's own
// tunnel /api/monitoring, which scrubs, forwards and alerts (Step 7).
import * as Sentry from '@sentry/browser';
import { browserSentryOptions } from './lib/errors/browser-options';

Sentry.init(browserSentryOptions());

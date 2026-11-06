// EZD-024 Step 6 (vault/plans/EZD-024.md): browser error reporting, always on. Envelopes go to the app's own
// tunnel /api/monitoring, which scrubs, forwards and alerts (Step 7). EZD-341: started with initAndBind
// (lib/errors/browser-client.ts), not Sentry.init, so the default integrations it references are not shipped.
import { startBrowserSentry } from './lib/errors/browser-client';

startBrowserSentry();

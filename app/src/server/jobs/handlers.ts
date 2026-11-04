// EZD-009 Step 5 (vault/plans/EZD-009.md): the handler for each job kind in this build. A function, so
// VERCEL_ENV is read per call. The test job is never registered in production. Later tickets add theirs here
// and call expectSafeToRunTwice for each kind (T19).
// EZD-021 Step 5 adds ai_read, production included.
// EZD-110a Step 12 adds notification_email, production included.
import { aiReadHandler } from './handlers/ai-read';
import { notificationEmailHandler } from './handlers/notification-email';
import { testJobHandler } from './handlers/test-job';
import type { JobHandlers } from './registry';

export function getHandlers(): JobHandlers {
  if (process.env.VERCEL_ENV === 'production')
    return { ai_read: aiReadHandler, notification_email: notificationEmailHandler };
  return {
    ai_read: aiReadHandler,
    notification_email: notificationEmailHandler,
    test: testJobHandler,
  };
}

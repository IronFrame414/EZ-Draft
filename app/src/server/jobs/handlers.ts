// EZD-009 Step 5 (vault/plans/EZD-009.md): the handler for each job kind in this build. A function, so
// VERCEL_ENV is read per call. The test job is never registered in production. Later tickets add theirs here
// and call expectSafeToRunTwice for each kind (T19).
// EZD-021 Step 5 adds ai_read, production included.
// EZD-110a Step 12 adds notification_email, production included.
// EZD-302 adds import (Polycam DXF detection), production included.
import { aiReadHandler } from './handlers/ai-read';
import { importHandler } from './handlers/import';
import { notificationEmailHandler } from './handlers/notification-email';
import { testJobHandler } from './handlers/test-job';
import type { JobHandlers } from './registry';

export function getHandlers(): JobHandlers {
  if (process.env.VERCEL_ENV === 'production')
    return {
      ai_read: aiReadHandler,
      import: importHandler,
      notification_email: notificationEmailHandler,
    };
  return {
    ai_read: aiReadHandler,
    import: importHandler,
    notification_email: notificationEmailHandler,
    test: testJobHandler,
  };
}

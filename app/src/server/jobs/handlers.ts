// EZD-009 Step 5 (vault/plans/EZD-009.md): the handler for each job kind in this build. A function, so
// VERCEL_ENV is read per call. The test job is never registered in production. Later tickets add theirs here
// and call expectSafeToRunTwice for each kind (T19).
// EZD-021 Step 5 adds ai_read, production included.
// EZD-110a Step 12 adds notification_email, production included.
// EZD-302 adds import (Polycam DXF detection), production included.
// EZD-124 adds project_purge (a deleted project's files), production included.
// EZD-1408 adds field_task_draft (AI field task drafts), production included.
// EZD-901a adds reference_convert (architect DXF reference buffers), production included.
import { aiReadHandler } from './handlers/ai-read';
import { fieldTaskDraftHandler } from './handlers/field-task-draft';
import { importHandler } from './handlers/import';
import { notificationEmailHandler } from './handlers/notification-email';
import { projectPurgeHandler } from './handlers/project-purge';
import { referenceConvertHandler } from './handlers/reference-convert';
import { testJobHandler } from './handlers/test-job';
import type { JobHandlers } from './registry';

export function getHandlers(): JobHandlers {
  if (process.env.VERCEL_ENV === 'production')
    return {
      ai_read: aiReadHandler,
      field_task_draft: fieldTaskDraftHandler,
      import: importHandler,
      notification_email: notificationEmailHandler,
      project_purge: projectPurgeHandler,
      reference_convert: referenceConvertHandler,
    };
  return {
    ai_read: aiReadHandler,
    field_task_draft: fieldTaskDraftHandler,
    import: importHandler,
    notification_email: notificationEmailHandler,
    project_purge: projectPurgeHandler,
    reference_convert: referenceConvertHandler,
    test: testJobHandler,
  };
}

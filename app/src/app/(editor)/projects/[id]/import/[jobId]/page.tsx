// EZD-307 (S02 Entry points "Continue to review"; Layout "Header card (differs from standard shell)"): Import review
// of one import at /projects/[id]/import/[jobId], in the editor entry group. It requires a session (signed out goes
// to /sign-in); the browser reads the import through GET /api/projects/[id]/imports/[jobId], which checks View
// projects and lets RLS decide what is visible.
import { connection } from 'next/server';
import type { ReactElement } from 'react';
import { ImportReview } from '../../../../../../editor/import-review/ImportReview';
import { StateHost } from '../../../../../../components/states/StateHost';
import { MessagesProvider } from '../../../../../../lib/messages';
import { requireSession } from '../../../../../../server/auth/session';
import { catalogFor } from '../../../../../../server/messages/catalog';

export default async function ImportReviewPage({
  params,
}: {
  params: Promise<{ id: string; jobId: string }>;
}): Promise<ReactElement> {
  await connection();
  await requireSession();
  const { id, jobId } = await params;
  return (
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <StateHost>
        <ImportReview projectId={id} jobId={jobId} />
      </StateHost>
    </MessagesProvider>
  );
}

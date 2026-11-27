// EZD-914 (S12 Entry points "Left rail Supplier markup tool"; Permissions "View: View projects. Upload: Upload
// references"): the Supplier markup screen for one project at /projects/[id]/supplier. It requires a session (signed
// out goes to /sign-in); the panel's routes check the permissions again (and See company costs, Q-0323). Without View
// projects on this project, or with a malformed id, the page is not found.
// EZD-1987 (audit F10; S12 board header): the page reads the project's name and client for the editor header card; a
// failed read is reported and the header shows the wordmark alone, as the editor does before its project loads.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import type { ReactElement } from 'react';
import { z } from 'zod';
import { StateHost } from '../../../../../components/states/StateHost';
import { SupplierMarkupScreen } from './SupplierMarkupScreen';
import { MessagesProvider } from '../../../../../lib/messages';
import { requireSession } from '../../../../../server/auth/session';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { reportError } from '../../../../../server/errors/report';
import { pageMessages } from '../../../../../server/messages/page-messages';
import { can } from '../../../../../server/permissions';
import { settingsPermissionContext } from '../../../../../server/settings/shell-data';

export default async function SupplierMarkupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  await connection();
  await requireSession();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await settingsPermissionContext();
  if (ctx === 'failed') {
    await reportError(new Error('supplier_permissions_load_failed'), {
      source: 'function',
      location: 'supplier.page',
    });
  }
  const known = ctx !== null && ctx !== 'failed';
  if (known && !can(ctx, 'view_projects', { projectId: id })) notFound();
  const canUpload = known && can(ctx, 'upload_references', { projectId: id });
  let project: { name: string; clientName: string | null } | null = null;
  const read = await createSessionClient()
    .from('project')
    .select('name, customer!project_customer_fk(name)')
    .eq('id', id)
    .maybeSingle();
  if (read.error) {
    await reportError(new Error('supplier_project_load_failed'), {
      source: 'function',
      location: 'supplier.header',
    });
  } else if (read.data !== null) {
    project = { name: read.data.name, clientName: read.data.customer?.name ?? null };
  }
  return (
    <MessagesProvider language="en" messages={pageMessages('supplier')}>
      <StateHost>
        <SupplierMarkupScreen projectId={id} canUpload={canUpload} project={project} />
      </StateHost>
    </MessagesProvider>
  );
}
